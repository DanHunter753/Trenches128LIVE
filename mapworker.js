'use strict';
// v0.30: builds one map's heightmap off the main thread (about a second), so changing maps between rounds never stalls the game.
const { parentPort, workerData } = require('worker_threads');
const T = require('./shared.js');
const r = T.terrainFor(workerData.seed);
parentPort.postMessage({ seed: r.seed, H: r.H, F: r.F }, [r.H.buffer]);
