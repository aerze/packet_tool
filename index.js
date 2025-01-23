#!/usr/bin/env node

console.log(">> program start", process.stdin.isTTY);
process.title = "abbyTool";
console.log(">> ", process.title);
const fs = require('fs');
const os = require('os');
const { Buffer } = require('node:buffer');
const { pipeline } = require(`node:stream/promises`);


var packet = [];
var packetInfo = {};

async function* transform(source, { signal }) {
    source.setEncoding("ascii");

    for await (const chunk of source) {
        yield await processChunk(chunk, { signal });
    }

    if (packet.length != 0) {
        processPacket(packet);
    }
}



async function processChunk (chunk) {
    const lines = chunk.split(os.EOL);
    const output = []
    let skip = false;

    // /** @type {string} */
    // var line;
    
    for (var line of lines) {
        line = line.trim();
        const isInfoLine = !line.startsWith('0x');
        
        if (isInfoLine) {
            console.log('\n');
            packetInfo = processInfo(line);
            skip = !Boolean(packetInfo.length ?? 0);
            continue;
        }

        if (skip) continue;

        var [index, data] = line.split(':');
        var indexNumber = parseInt(index, 16);
        var [bytes] = data.trim().split('  ');
        var stringBytes = bytes.split(' ');
        
        if (indexNumber == 0) {
            var result = processPacket(packet.join('').trim());
            // console.log('<< result:', result);
            output.push(result);
            packet.length = 0;
            packet.push(...stringBytes);
        } else {
            packet.push(...stringBytes);
        }
    }

    return output.join('\n<< ');
}

const PARSE_STEP = {
    TIME: 0, // parse time
    IP:   1, // parse ip info
    REST: 2, // parse everything else
}

/**
 * Parse initial info line into an object
 * @param {string} line 
 */
function processInfo(line) {
    let parseStep = PARSE_STEP.TIME;
    let parseIndex = 0;
    let stringBuffer = '';
    let parsedKey = '';
    let parsedArray = [];
    let parsedValue = '';
    let inArray = false;
    const info = {
        TIME: '',
        IP: '',
    }

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        switch (parseStep) {
            case PARSE_STEP.TIME: {
                if (char === ' ') {
                    info.TIME = line.slice(parseIndex, i);
                    i += 3;
                    parseIndex = i + 1;
                    parseStep++;
                }
                continue;
            }

            case PARSE_STEP.IP: {
                stringBuffer = line.slice(parseIndex, i);
                if (stringBuffer.includes('IP ')) {
                    parseIndex = i;
                }
                if (char === ':') {
                    info.IP = line.slice(parseIndex, i);
                    i += 1;
                    parseIndex = i + 1;
                    parseStep++;
                }
                continue;
            }

            case PARSE_STEP.REST: {
                stringBuffer = line.slice(parseIndex, i);

                if (char == ' ') {
                    parsedKey = stringBuffer;
                    parseIndex = i + 1;
                    continue;
                }

                if (char == '[') {
                    parsedArray = [];
                    parseIndex = i + 1;
                    inArray = true;
                    continue;
                }
                
                if (char == ']') {
                    parsedArray.push(stringBuffer);
                    i += 2;
                    parseIndex = i + 1;
                    info[parsedKey] = parsedArray;
                    inArray = false;
                    parsedKey = '';
                    parsedArray = [];
                    continue;
                }

                if (char == ',') {
                    if (inArray) {
                        parsedArray.push(stringBuffer)
                        parseIndex = i + 1;
                    } else {
                        parsedValue = parseInt(stringBuffer, 10);
                        if (Number.isNaN(parsedValue)) {
                            parsedValue = stringBuffer;
                        }
                        info[parsedKey] = parsedValue;
                        i += 1;
                        parseIndex = i + 1;
                        parsedKey = '';
                        parsedValue = '';
                        continue;
                    }
                }
            }
        }
    }
    stringBuffer = line.slice(parseIndex, line.length);
    parsedValue = parseInt(stringBuffer, 10);
    if (Number.isNaN(parsedValue)) {
        parsedValue = stringBuffer;
    }
    info[parsedKey] = parsedValue;
    console.log(">> info", info);
    return info;
}

function processPacket(packetString) {
    // console.log('>>', packetString);
    var buffer = Buffer.from(packetString, 'hex');
    var slice = buffer.subarray(-packetInfo.length);
    console.log('<<\n', slice.toString('hex'), '\n', slice.toString('ascii'));
    var output = buffer.toString('ascii');
    // console.log('<<', output);
    return output.slice(-packetInfo.length);
}

async function main(incomingStream) {
    await pipeline(
        incomingStream,
        transform,
        // process.stdout,
    )
}

const stream = fs.createReadStream("./dumps/dump02.txt");

main(stream).catch(console.error);