#!/usr/bin/env node
// Clef (PACT-61, spec 0002). An opt-in pact tool that runs Clef, the local
// decision model, with a pinned llama.cpp server and a pinned model file: no
// Ollama. Setup fetches and checks them; a supervisor on 127.0.0.1 serves them.
//
//   node clef.mjs setup  [--cpu] [--yes]   print the plan; with --yes, fetch and keep the files
//   node clef.mjs verify                    re-hash every kept file against the pin table
//   node clef.mjs ensure [--wait n]         start the supervisor if none runs; print one JSON line
//   node clef.mjs status | stop             show the run state; end the supervisor and its server
//   node clef.mjs remove [--yes]            name, or with --yes delete, the clef folder
//
// Everything the tool may fetch is in the pin table below: one server build
// and one model, each with its size and sha256, from two fixed repos. A file
// is kept only when its size and sha256 match. Nothing here reads a URL,
// host or hash from the environment, a flag or a file; every URL is built from
// the table and checked before it is requested.
//
// Output is fixed words, file names from the table, counts, and the node path
// setup records; a failure that is not a refusal also prints Node's own error
// text, which can hold a local path. A refusal is one line `REFUSED <word>: <reason>` and the last line is a RESULT line:
//   0  RESULT: pass            the plan printed, the files kept, or the files verified
//   1  RESULT: fail <words>    a file failed verify
//   2  RESULT: refused <word>  a refusal (clef-pin, clef-platform, clef-space,
//                              clef-node, clef-setpriv, clef-redirect, clef-size,
//                              clef-hash, clef-archive, clef-home, clef-running,
//                              clef-fetch) or a usage fault
// `ensure` prints its JSON line and exits 0 (ready or starting), 3 (not set up)
// or 4 (failed); docs/clef.md has its states.
//
// Node 24 or later, ESM, node: built-ins only. Every rule is an exported
// function that takes what it needs as parameters (the transport, the origins,
// the folder, the platform); only main reads the real values, and main runs
// only when this file is the entry script. No flag reaches those parameters;
// the one environment variable read, CLAUDE_CONFIG_DIR, picks the Claude home
// folder, only as an absolute path, and never one inside the starting folder
// (claudeHome, assertRealFolders).

import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, statfsSync, writeFileSync, writeSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { request as httpsRequest, Agent } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { homedir, userInfo } from 'node:os';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, gunzipSync } from 'node:zlib';

// ---------------------------------------------------------------- the pin table

/** The macOS arm64 build (spec 0003 M3), named by both darwin keys. */
const MACOS_ARCHIVE = Object.freeze({ asset: 'llama-b12211-bin-macos-arm64.tar.gz', size: 16711245, sha256: '4da4edb437358d31d55938ad849d262ca31b0e0ffb35e9caedb727a0cd5a8f0f', kind: 'tgz', exe: 'llama-b12211/llama-server',
  files: Object.freeze([
  ['llama-b12211/LICENSE', 1078, '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d'],
  ['llama-b12211/ggml-metal-tuning', 87696, 'bcd4adea51d936aa77758c7a5a5d4dd4834205a2488e17050a2c607af86a4f67'],
  ['llama-b12211/ggml-rpc-server', 133024, '38f67707c237046cfe29921bb5854a57eedcc9a32a581f275ed394f2cee92116'],
  ['llama-b12211/libggml-base.0.29.0.dylib', 772312, 'a27679374a505439de2220d7c87e52bb371a04568ca7b106c3668e7ba3f92862', 'libggml-base.0.dylib'],
  ['llama-b12211/libggml-blas.0.29.0.dylib', 58776, '786754ac19bff80ad4ca76d44d3031f32593772f38d9da819b428dc702f63339', 'libggml-blas.0.dylib'],
  ['llama-b12211/libggml-cpu.0.29.0.dylib', 959344, '0cae225e9b2f9fcb0c64a1f21f855dcb2ee83c059f503cd37cbff331d509c6a6', 'libggml-cpu.0.dylib'],
  ['llama-b12211/libggml-metal.0.29.0.dylib', 5688168, 'f02a10b8d7d04cc901f24752f8652288e234dd4e4216f0ca291a5bb6bfd510c8', 'libggml-metal.0.dylib'],
  ['llama-b12211/libggml-rpc.0.29.0.dylib', 243600, '1b4d7b2187abe3eda371ce6a72843125b4c6d07a7f14baea5929ede6b5b89d37', 'libggml-rpc.0.dylib'],
  ['llama-b12211/libggml.0.29.0.dylib', 60016, 'f2b3b1a494448bb17a7bfe6111873326ba2872bdbc52a95c6f1140c6868261b8', 'libggml.0.dylib'],
  ['llama-b12211/libllama-batched-bench-impl.dylib', 56576, 'ea42410725d43ce4dc61f361171e9ce2642c2141cadac34975dee626902074aa'],
  ['llama-b12211/libllama-bench-impl.dylib', 323016, '19ac409f52fd0d45174aebdfb3a03d0c49acbc7a6f8b89648f16895d364795ec'],
  ['llama-b12211/libllama-cli-impl.dylib', 255240, 'cc07c0d4798d33669f65dfa275a755575277eb08dfb3049bcb14d3bf22c534c2'],
  ['llama-b12211/libllama-common.0.9.0.dylib', 8094584, 'c49abb00ca8e1a3ab809fd122a2867f6924d61456878d85df4d5d8129628decc', 'libllama-common.0.dylib'],
  ['llama-b12211/libllama-completion-impl.dylib', 121808, '240ee5168ff18ab6dff29dd2168438f079179ba0f6b51a841d18f16f6f493496'],
  ['llama-b12211/libllama-fit-params-impl.dylib', 55264, '8c60cc35f7b3fc018686a293e37eb1a485142ee3bb55512ce66839eea8d98367'],
  ['llama-b12211/libllama-perplexity-impl.dylib', 156384, 'ab36bba0f9873b64712660e36b7201572c11d5efd086d1a3c55cb44524895db9'],
  ['llama-b12211/libllama-quantize-impl.dylib', 96496, 'f5a8d325802712841b640da755ddce17c6ef4e01bde3c3bcda2144186e9c040b'],
  ['llama-b12211/libllama-server-impl.dylib', 9837128, '83a4a30eb428545bc3d5ec5158e10661de978ebc67fdb86e0cb09c2f8aecdda6'],
  ['llama-b12211/libllama.0.9.0.dylib', 3810368, '74e5225102fef73ebf89a5197775766265004a1874b4df5c2ec1003d82e30a90', 'libllama.0.dylib'],
  ['llama-b12211/libmtmd.0.9.0.dylib', 1693200, '18f8a5f51ee3c1d76f909db00d72a1e2123ad5bb2d90c055f597aa99faee4318', 'libmtmd.0.dylib'],
  ['llama-b12211/llama', 107320, '577e4440a8fce23621f1a8d80f4a0eb6a0bf3d5b209ae05bcd2e18513fb42b4c'],
  ['llama-b12211/llama-batched-bench', 33488, 'a6a8e0ff2d78ccd311a0917cd07f410a4395c0bd511ecec949eae28af21de028'],
  ['llama-b12211/llama-bench', 33464, '6d042ef032678056645d50e8e153cf101c9da616e6ee97455085254cbd6137db'],
  ['llama-b12211/llama-cli', 49960, '22b2065b1d006ae33a02e009b445e5c26bc441d68bffeb67c4dfb5ba23b92ffe'],
  ['llama-b12211/llama-completion', 33472, 'e04882cff3d2aba1dee284ad844a96fa5e95bd363a38cc6cfb4fae682d21a37e'],
  ['llama-b12211/llama-connect', 8251536, 'a2e54e1198276037f05882b5142641cd4c55c7fbdd748fcb10a4a8109c723d59'],
  ['llama-b12211/llama-cvector-generator', 102296, '6a1de0ffbdfaecca41984c11689b3bfa66f36391972d0dadcc18d24ce5aaf6f2'],
  ['llama-b12211/llama-export-lora', 99856, 'd8526dd4300e2ef15028879b695306bcfe25c8a5970375852ca046d0f46015b8'],
  ['llama-b12211/llama-fit-params', 33472, 'e7da4e292a53ea445ecab8051d55e68aa8f90492eef0819d3a1b5cc2fdf97607'],
  ['llama-b12211/llama-gemma3-cli', 35344, 'f7f9126b0881654bdb4c9ceab6de40f42e31998fa0c775505b5979ef7e8e567e'],
  ['llama-b12211/llama-gguf-split', 60000, '183d71c37f5db7660a3e7bfb2d81a3aa68ca0fdb3e36230a4276ad72f17b9c05'],
  ['llama-b12211/llama-imatrix', 206320, '17fcc746efa3b11312d5f3064bef32a1425ce39ed5f4cd7142d1e273ce58d878'],
  ['llama-b12211/llama-llava-cli', 35344, '9a77293c34faa94ae6955f9b1da3dca9fa55cf09fcd0fff87c96f5ec44b9d547'],
  ['llama-b12211/llama-minicpmv-cli', 35344, '4baffe08bb410686ee032b1b2ff9a948bbde3fdc014dddf750f36978e3b40589'],
  ['llama-b12211/llama-mtmd-cli', 103648, 'ad3fab1bf43c11eb6d2852792cfd0c1c59dab996a5a804849a41e68d45b076d6'],
  ['llama-b12211/llama-mtmd-debug', 75824, '73fc8f269a379333b6ccff05f9d21bd6d9c4c094181afb382467f0531dacfe0d'],
  ['llama-b12211/llama-perplexity', 33472, '3059af5f1197fb99ec7eb7260b28e4e59a3d0e9b915a7fec5b313cd9efe07a75'],
  ['llama-b12211/llama-quantize', 33472, '47d49e414ae08afe3a8515768eed9f2b87186e719dc2e272cf38289c75c01ef9'],
  ['llama-b12211/llama-qwen2vl-cli', 35344, '9be4a36b2587c0216009b1ed59ac79b1e4dd2e885f326e8aeffac8aa37761d31'],
  ['llama-b12211/llama-results', 58912, 'a330b36d5f932de1df768dbc8532512eefd40d0ecc1879f48d964b8986743db9'],
  ['llama-b12211/llama-server', 49984, 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959'],
  ['llama-b12211/llama-tokenize', 58736, 'b3573499a413db7cbbf4d05f2da07b619d6b7896930c344581ff8fb72b830544'],
  ['llama-b12211/llama-tts', 59144, '74b796837548030f0bddc6168c376f6cd4d8b3a797d3e43020156da589309cf1'],
  ]) });

/** The server build (S5). `files` rows are [path in the archive, size, sha256]. */
export const SERVER = Object.freeze({
  repo: 'ggml-org/llama.cpp',
  tag: 'b12211',
  archives: Object.freeze({
    'win32-x64-cpu': Object.freeze({ asset: 'llama-b12211-bin-win-cpu-x64.zip', size: 24886431, sha256: '23729000408c6968faf5e322afc99319d3b8c576ba872ef7663d9b89810090f3', kind: 'zip', exe: 'llama-server.exe',
      files: Object.freeze([
      ['LICENSE-LLVM-OpenMP', 19741, 'fdad1758a9e1f9d5a81e18879b3406772115edc92c24bfa36b70c654f325e8e4'],
      ['ggml-base.dll', 834048, 'f2dae864981842df3d15032ef3cbebe1c05f9a4fb0887b0345730306d4934fb2'],
      ['ggml-cpu-alderlake.dll', 1460736, 'bb3cfd681f0e8a5f706dd1b0e8e685ab674556c7a2bc5a606ca09e14202aaa23'],
      ['ggml-cpu-cannonlake.dll', 1694208, '7ea02ec0ee2c074f3669b7a198baa9401ec3a316ba0da436d1034351d21d33c8'],
      ['ggml-cpu-cascadelake.dll', 1667072, '25bc16758f8923ffa963954f2fe83c278c29a9546bcac25c075fa1d5856fdbbc'],
      ['ggml-cpu-cooperlake.dll', 1676800, 'fc71fd98409f14180f8ffe749ad4de715d1e832174d0bbb3ebd3e5269d723374'],
      ['ggml-cpu-haswell.dll', 1465856, 'db85e44b3e7cb3f65c16f21e40417101172f77e80de98257571e066f14c3baa0'],
      ['ggml-cpu-icelake.dll', 1673728, '7e57541cf982ed5c17a029a2ad2d64d7c543913139b36e914d8cdc5ba122f645'],
      ['ggml-cpu-ivybridge.dll', 1347072, 'a4a7940b979175abad4d3ecc60c82a28628af0644fe9136ba09c2099c7178c00'],
      ['ggml-cpu-piledriver.dll', 1340416, '89d0c486137fbfd228d27963414e54fda65505c8b3df6108afbf00ac0151d665'],
      ['ggml-cpu-sandybridge.dll', 1317376, '8fae2378fa9f5eb73ae3c12b91e2a3ab2f6108697581667d25cd9bbff3bc0ba4'],
      ['ggml-cpu-sapphirerapids.dll', 1953280, 'cca075ea797b51db81e58029997665eef83f797280124150cb352a56cd98529f'],
      ['ggml-cpu-skylakex.dll', 1687552, 'd9657d4429d37a4bd463441b42a9a2b70473b1e356aeffcdca6886da15d640b2'],
      ['ggml-cpu-sse42.dll', 941568, '4ab5352bb8b37fe2ae69b5ebeb7575937e988424a60ecc9f0c1d141b483574eb'],
      ['ggml-cpu-x64.dll', 932352, '12e51e926bb931a8cd76985540a31b359de583e8ef6136e269b4607871ffdf20'],
      ['ggml-cpu-zen4.dll', 1683456, '016d959fde1723b0bd8f45b83aa28a6a891b06de81aa2cb5afbd88bd554a0372'],
      ['ggml-rpc-server.exe', 117248, 'bfe0b9578680e014d51736c7aa94aa4f7b2a2055c41886d8656f3a500983ccc3'],
      ['ggml-rpc.dll', 236032, 'c1ea5c27c2c9377bf8ba90591b54c660f1737520c0bfe2bfd86dc774dd51b37f'],
      ['ggml.dll', 78848, '510e10f0c398c6a2cc7aa68bd3f6c1b3df23810d22cb7f52d75ef502e95b1bf6'],
      ['libomp.dll', 768000, 'a12116ba72d1d6820407cf30be23da04ce79d6bb8a71a5ee71759c5a1faa6f1c'],
      ['llama-batched-bench-impl.dll', 61952, '4bb1f27bc4d1acbfb95d47e8f1fed976bb25f89fe6965d9fff85b69a8e90fa80'],
      ['llama-batched-bench.exe', 9728, '87767102a11d198d20d6582b074c840c629f268743dc9b8e3b0e0142993b24f4'],
      ['llama-bench-impl.dll', 404480, '09762970835b58708e5e07f047cfa92771a6d574e76d43a6287eec9a5681109b'],
      ['llama-bench.exe', 9728, '1d98353354c1c9374c6d6ff62dabb34ab875b0bc45d06284bb99743aeee7776c'],
      ['llama-cli-impl.dll', 3396608, '86c982caf13389861b3d98bef3f8776c355841aecfc975fa7d98043cf7f33cd6'],
      ['llama-cli.exe', 9728, 'a43213e63852f7fafb801ad1b00b91884608bf0c1bca4abc0ece43368173e6d4'],
      ['llama-common.dll', 8385024, '71f734b0b5f591f7e737310d3095331b0b3260d92ca98b75a80e63db3f70027c'],
      ['llama-completion-impl.dll', 138752, 'f358b52fd61a37dac60839b01025b423aec6147f4b3f7c4a69dafce914a5ed63'],
      ['llama-completion.exe', 9728, 'd38090a65f72e1a410dae995fd84296c8591e736e10ebf296fff01edae718f2f'],
      ['llama-connect.exe', 11473920, '9f2bdd778f96971995a80add8d6b2478c156f799933337a19dbf80cdaad21b1d'],
      ['llama-fit-params-impl.dll', 43520, 'bce35aa635601f0b182cc94f2b553fc134aa92f731522a06f68a34ce14b3dec0'],
      ['llama-fit-params.exe', 9728, '3d9838c42d6b32d7fe02c41408ca851061bd8725b0a48655806bfd12bb46264c'],
      ['llama-gemma3-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-gguf-split.exe', 61952, 'eeac8b82306b16d0dfb94f29bab8f14db0f2b34e2041c9b8b84b5d1a2a75a389'],
      ['llama-imatrix.exe', 253952, '35f3f4f044dbcd4eba676ce05b3c494119b221852fe4f76b1c459770c2d38fc0'],
      ['llama-llava-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-minicpmv-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-mtmd-cli.exe', 97280, '45ff19eb625263c4f33f46ab70b7a545079aa8b78225b319a645be01d1bccf38'],
      ['llama-mtmd-debug.exe', 56832, '685ed49cfce7b0e7794212d9c8cd8464ae659021fa6c4ce98cc0e2579d3af461'],
      ['llama-perplexity-impl.dll', 198144, '60ce9b9613534494a1b4eea22a0184684b191ecc9f90ec7289763da2191689f4'],
      ['llama-perplexity.exe', 9728, 'f3591bb0d8218cfbef3980c59a9611983098956b1c496faba30fddfe303b0902'],
      ['llama-quantize-impl.dll', 137216, 'd10bf650cd02cabd4ed08b8393d605aac0fe1f5d0a692ff59c990c772b83cc3e'],
      ['llama-quantize.exe', 9728, 'fe8b2b468fe1085e826167d42b275be470b730361dd749de46b97f9644131072'],
      ['llama-qwen2vl-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-results.exe', 47616, 'fa9940ae2548bf7348e653f9f5574d5a66e2bf1f2976879d8e8ddae5ce706d7b'],
      ['llama-server-impl.dll', 10124800, '0c1bddd982b8d4da87889a0b314f76550ae3cca064124c3f936e21e716980a25'],
      ['llama-server.exe', 9728, '75e1099fec4b0e2c0ddd90813653a6a70638b79c6f6d38bf3103c85d7312e89e'],
      ['llama-tokenize.exe', 59392, 'a0b9ed345a03e49874c7285befb1ded2955436678dc3e4b2c619247c68ac3a9b'],
      ['llama-tts.exe', 46592, '54fdf653267a20c76e662ce3e436cbe48460260916e77fac5f030ee96fd1f146'],
      ['llama.dll', 3852800, '723f1962402bada0970c9b7df53f157d3267d5f09b3a1a56e0d6087af3225ddc'],
      ['llama.exe', 105472, '274b849a0686c9e8fc539cce8f1f7c173b40dcc7668cc5f56262acb3b10a869d'],
      ['mtmd.dll', 2217472, 'cd5acb7df4e4cfa0260922b8bcfa80f112c8751995ae15fc7b2078457bcdcb01'],
      ]) }),
    'win32-x64-vulkan': Object.freeze({ asset: 'llama-b12211-bin-win-vulkan-x64.zip', size: 37845757, sha256: '20954cbad1a4626436c6ebaed5e48477f68427b075934689f360301ac426a2f1', kind: 'zip', exe: 'llama-server.exe',
      files: Object.freeze([
      ['LICENSE-LLVM-OpenMP', 19741, 'fdad1758a9e1f9d5a81e18879b3406772115edc92c24bfa36b70c654f325e8e4'],
      ['ggml-base.dll', 834048, 'f2dae864981842df3d15032ef3cbebe1c05f9a4fb0887b0345730306d4934fb2'],
      ['ggml-cpu-alderlake.dll', 1460736, 'bb3cfd681f0e8a5f706dd1b0e8e685ab674556c7a2bc5a606ca09e14202aaa23'],
      ['ggml-cpu-cannonlake.dll', 1694208, '7ea02ec0ee2c074f3669b7a198baa9401ec3a316ba0da436d1034351d21d33c8'],
      ['ggml-cpu-cascadelake.dll', 1667072, '25bc16758f8923ffa963954f2fe83c278c29a9546bcac25c075fa1d5856fdbbc'],
      ['ggml-cpu-cooperlake.dll', 1676800, 'fc71fd98409f14180f8ffe749ad4de715d1e832174d0bbb3ebd3e5269d723374'],
      ['ggml-cpu-haswell.dll', 1465856, 'db85e44b3e7cb3f65c16f21e40417101172f77e80de98257571e066f14c3baa0'],
      ['ggml-cpu-icelake.dll', 1673728, '7e57541cf982ed5c17a029a2ad2d64d7c543913139b36e914d8cdc5ba122f645'],
      ['ggml-cpu-ivybridge.dll', 1347072, 'a4a7940b979175abad4d3ecc60c82a28628af0644fe9136ba09c2099c7178c00'],
      ['ggml-cpu-piledriver.dll', 1340416, '89d0c486137fbfd228d27963414e54fda65505c8b3df6108afbf00ac0151d665'],
      ['ggml-cpu-sandybridge.dll', 1317376, '8fae2378fa9f5eb73ae3c12b91e2a3ab2f6108697581667d25cd9bbff3bc0ba4'],
      ['ggml-cpu-sapphirerapids.dll', 1953280, 'cca075ea797b51db81e58029997665eef83f797280124150cb352a56cd98529f'],
      ['ggml-cpu-skylakex.dll', 1687552, 'd9657d4429d37a4bd463441b42a9a2b70473b1e356aeffcdca6886da15d640b2'],
      ['ggml-cpu-sse42.dll', 941568, '4ab5352bb8b37fe2ae69b5ebeb7575937e988424a60ecc9f0c1d141b483574eb'],
      ['ggml-cpu-x64.dll', 932352, '12e51e926bb931a8cd76985540a31b359de583e8ef6136e269b4607871ffdf20'],
      ['ggml-cpu-zen4.dll', 1683456, '016d959fde1723b0bd8f45b83aa28a6a891b06de81aa2cb5afbd88bd554a0372'],
      ['ggml-rpc-server.exe', 117248, 'bfe0b9578680e014d51736c7aa94aa4f7b2a2055c41886d8656f3a500983ccc3'],
      ['ggml-rpc.dll', 236032, 'c1ea5c27c2c9377bf8ba90591b54c660f1737520c0bfe2bfd86dc774dd51b37f'],
      ['ggml-vulkan.dll', 42006016, '9a5cfd2c6b5d5204541fa3a1faa3ccfd4c365700af5ad4499961cf15eeb55fc3'],
      ['ggml.dll', 78848, '510e10f0c398c6a2cc7aa68bd3f6c1b3df23810d22cb7f52d75ef502e95b1bf6'],
      ['libomp.dll', 768000, 'a12116ba72d1d6820407cf30be23da04ce79d6bb8a71a5ee71759c5a1faa6f1c'],
      ['llama-batched-bench-impl.dll', 61952, '4bb1f27bc4d1acbfb95d47e8f1fed976bb25f89fe6965d9fff85b69a8e90fa80'],
      ['llama-batched-bench.exe', 9728, '87767102a11d198d20d6582b074c840c629f268743dc9b8e3b0e0142993b24f4'],
      ['llama-bench-impl.dll', 404480, '09762970835b58708e5e07f047cfa92771a6d574e76d43a6287eec9a5681109b'],
      ['llama-bench.exe', 9728, '1d98353354c1c9374c6d6ff62dabb34ab875b0bc45d06284bb99743aeee7776c'],
      ['llama-cli-impl.dll', 3396608, '86c982caf13389861b3d98bef3f8776c355841aecfc975fa7d98043cf7f33cd6'],
      ['llama-cli.exe', 9728, 'a43213e63852f7fafb801ad1b00b91884608bf0c1bca4abc0ece43368173e6d4'],
      ['llama-common.dll', 8385024, '71f734b0b5f591f7e737310d3095331b0b3260d92ca98b75a80e63db3f70027c'],
      ['llama-completion-impl.dll', 138752, 'f358b52fd61a37dac60839b01025b423aec6147f4b3f7c4a69dafce914a5ed63'],
      ['llama-completion.exe', 9728, 'd38090a65f72e1a410dae995fd84296c8591e736e10ebf296fff01edae718f2f'],
      ['llama-connect.exe', 11473920, '9f2bdd778f96971995a80add8d6b2478c156f799933337a19dbf80cdaad21b1d'],
      ['llama-fit-params-impl.dll', 43520, 'bce35aa635601f0b182cc94f2b553fc134aa92f731522a06f68a34ce14b3dec0'],
      ['llama-fit-params.exe', 9728, '3d9838c42d6b32d7fe02c41408ca851061bd8725b0a48655806bfd12bb46264c'],
      ['llama-gemma3-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-gguf-split.exe', 61952, 'eeac8b82306b16d0dfb94f29bab8f14db0f2b34e2041c9b8b84b5d1a2a75a389'],
      ['llama-imatrix.exe', 253952, '35f3f4f044dbcd4eba676ce05b3c494119b221852fe4f76b1c459770c2d38fc0'],
      ['llama-llava-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-minicpmv-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-mtmd-cli.exe', 97280, '45ff19eb625263c4f33f46ab70b7a545079aa8b78225b319a645be01d1bccf38'],
      ['llama-mtmd-debug.exe', 56832, '685ed49cfce7b0e7794212d9c8cd8464ae659021fa6c4ce98cc0e2579d3af461'],
      ['llama-perplexity-impl.dll', 198144, '60ce9b9613534494a1b4eea22a0184684b191ecc9f90ec7289763da2191689f4'],
      ['llama-perplexity.exe', 9728, 'f3591bb0d8218cfbef3980c59a9611983098956b1c496faba30fddfe303b0902'],
      ['llama-quantize-impl.dll', 137216, 'd10bf650cd02cabd4ed08b8393d605aac0fe1f5d0a692ff59c990c772b83cc3e'],
      ['llama-quantize.exe', 9728, 'fe8b2b468fe1085e826167d42b275be470b730361dd749de46b97f9644131072'],
      ['llama-qwen2vl-cli.exe', 27648, 'ee844f5354ee0721f5f9112bed0effe7808232e3ca0d0c40dd0d1570a74a598b'],
      ['llama-results.exe', 47616, 'fa9940ae2548bf7348e653f9f5574d5a66e2bf1f2976879d8e8ddae5ce706d7b'],
      ['llama-server-impl.dll', 10124800, '0c1bddd982b8d4da87889a0b314f76550ae3cca064124c3f936e21e716980a25'],
      ['llama-server.exe', 9728, '75e1099fec4b0e2c0ddd90813653a6a70638b79c6f6d38bf3103c85d7312e89e'],
      ['llama-tokenize.exe', 59392, 'a0b9ed345a03e49874c7285befb1ded2955436678dc3e4b2c619247c68ac3a9b'],
      ['llama-tts.exe', 46592, '54fdf653267a20c76e662ce3e436cbe48460260916e77fac5f030ee96fd1f146'],
      ['llama.dll', 3852800, '723f1962402bada0970c9b7df53f157d3267d5f09b3a1a56e0d6087af3225ddc'],
      ['llama.exe', 105472, '274b849a0686c9e8fc539cce8f1f7c173b40dcc7668cc5f56262acb3b10a869d'],
      ['mtmd.dll', 2217472, 'cd5acb7df4e4cfa0260922b8bcfa80f112c8751995ae15fc7b2078457bcdcb01'],
      ]) }),
    'linux-x64-cpu': Object.freeze({ asset: 'llama-b12211-bin-ubuntu-x64.tar.gz', size: 23109987, sha256: '962924b5431bc1237a9e5d26ba072d37b6fe05f79b495206e7ff6134887624c5', kind: 'tgz', exe: 'llama-b12211/llama-server',
      files: Object.freeze([
      ['llama-b12211/LICENSE', 1078, '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d'],
      ['llama-b12211/ggml-rpc-server', 195536, 'e4ed7b961c67f9abf6b91c9409714c3a0154869d00fbfcf1f1e67f2a61dc89f5'],
      ['llama-b12211/libggml-base.so.0.29.0', 946176, '618aae472f7b041d2efab58d86c6471263d503bf7c4cc5ea40dd6b91ff5fc2a4', 'libggml-base.so.0'],
      ['llama-b12211/libggml-cpu-alderlake.so', 1455736, 'ae990ef0ac6f28a4b13a89e613c551b77694db16bf01332baf82619c107700b5'],
      ['llama-b12211/libggml-cpu-cannonlake.so', 1618752, '777d4395e2a4ad70059d7c06f77856e8552e4d6b12dcd7d15919a52498729fea'],
      ['llama-b12211/libggml-cpu-cascadelake.so', 1630744, '2fe006a3e958e0ce01e611f10e76066db7bcede4e25eebcddbaa871527ca2232'],
      ['llama-b12211/libggml-cpu-cooperlake.so', 1630816, 'bb9ae0899202ca1c0ad5e0f23c5b09f179cc48cbf1e8af6d581c2c8caef8af03'],
      ['llama-b12211/libggml-cpu-haswell.so', 1459832, 'da288889750392560dd4b922f3cdaee88567cc1aedb7f525a2e415ed280a47cd'],
      ['llama-b12211/libggml-cpu-icelake.so', 1630744, 'd1ce43ffcd6d3ecc3581b611297b3fd24a99234a536827de435815309845e110'],
      ['llama-b12211/libggml-cpu-ivybridge.so', 1399552, '9aae18a31f1ea5a3aa881c3b96e6cbe558d4cde682b6acf0bd2916d928510694'],
      ['llama-b12211/libggml-cpu-piledriver.so', 1391360, 'ff6f486b7486eb4a7b661d3c0336138fba2481118a4813be40f790267a80f626'],
      ['llama-b12211/libggml-cpu-sandybridge.so', 1372904, '4fcbcfe781d6df24b37e06500a164086506afc0542d2690238618261120a59a5'],
      ['llama-b12211/libggml-cpu-sapphirerapids.so', 1897152, 'c5c16b23805b8c5fc7817ee277657f59ab882269391ab9f611fd6b75dcb5839a'],
      ['llama-b12211/libggml-cpu-skylakex.so', 1618752, '55d53dbaa0f19015d27c576c5c57683b21a453ee95490192b9ece7e72c9d8dd8'],
      ['llama-b12211/libggml-cpu-sse42.so', 980544, '073800a428bf19ef9c37fc7cbc55451f2ecae6f7beb37d1c0447bd17f6e15ef4'],
      ['llama-b12211/libggml-cpu-x64.so', 976568, '25f93d8f3119d5b656144290bf5d2125a10f6bcbf54a3f9135b312c9900883c7'],
      ['llama-b12211/libggml-cpu-zen4.so', 1630816, 'aaa1b6db727c1ecd62a53462674df544e1005fb46b2fd6d1c884f52b300b1b38'],
      ['llama-b12211/libggml-rpc.so', 328896, '7d0e1cbca812f494de3da87ab17a89899067257d55b3d212d850c9a738ac0f6d'],
      ['llama-b12211/libggml.so.0.29.0', 51040, '8643a58bb37af6fb153e2ea98b48efa227855725ee51c05f4ca76b9867956463', 'libggml.so.0'],
      ['llama-b12211/libllama-batched-bench-impl.so', 48904, 'd97ce0d9ba48c4018080a21a24b5429044fe8b0fa2ea47a8a9f8bd2ba2608765'],
      ['llama-b12211/libllama-bench-impl.so', 490560, '389bc4f02f645051f8adae70ab961a5d5ca43732ec159cba276152d88f22e6ac'],
      ['llama-b12211/libllama-cli-impl.so', 277032, 'bf0ba08ae38c92cf82fe0e353d79c2c20d754a5b82f566473799d386140c7338'],
      ['llama-b12211/libllama-common.so.0.9.0', 6783104, '0abc2030d83d393613d735b3eee3a16c1e00c5715bc8b983c643282cdf675b8a', 'libllama-common.so.0'],
      ['llama-b12211/libllama-completion-impl.so', 144864, '7db937c248af4d5c893ae8c05e274c1f1c1186f394e6ba7e487fd0b9618d193c'],
      ['llama-b12211/libllama-fit-params-impl.so', 39760, 'e21853f79111c4ed082de1570e3966045feb83d62a1d5361e91a5a8dc102a2b8'],
      ['llama-b12211/libllama-perplexity-impl.so', 171912, 'f298a5e98852c319b9e956da06ee6660f19366d9d67ca2fdeebbc95d7be3d82b'],
      ['llama-b12211/libllama-quantize-impl.so', 81840, '79d821e4e88ebc408f52a1b3d7d13f44aeb6f71bba13574e7d395608b671775a'],
      ['llama-b12211/libllama-server-impl.so', 8296336, 'd351c1313224cf689aec6b03a94cbad779d40d28bc9b6b59cdd7009b85362dc4'],
      ['llama-b12211/libllama.so.0.9.0', 5495696, '628b0c43bf91a40547be46bdb338dc13540e6cb2a77bb6ab524312a63e90d14f', 'libllama.so.0'],
      ['llama-b12211/libmtmd.so.0.9.0', 2314600, 'e16863911c56b0295a29f8dfec02b010a426dccdbf599d47bfb9b1beecb58689', 'libmtmd.so.0'],
      ['llama-b12211/llama', 62376, '5e541f9a66089fe7bd09b272880bf390b38e68dda84e10fecf47ab488703594c'],
      ['llama-b12211/llama-batched-bench', 15976, '3b70e62c5c5cf43c8c436622a845ad4b80c01837d6ba3a10c90e39b219bbd2ab'],
      ['llama-b12211/llama-bench', 17864, 'cf1b38c10444d9426a600e318035b2b247f9ad5f1279de4b0c42894aee098cf2'],
      ['llama-b12211/llama-cli', 1511440, 'd6cc36e5fdc2eedd6e052dc7eb1e29d21065331e37e31f57ab2ca4720635dba2'],
      ['llama-b12211/llama-completion', 15968, '7119bef261611b26f326f7c4da4dc3fdeb7bb28e2faf1ec392bda7b21215ef52'],
      ['llama-b12211/llama-connect', 9729072, '0f57652dee1df5a5d69dfb11a8775f864345cfb881b2bd34c6ca6c409ce73d25'],
      ['llama-b12211/llama-fit-params', 15968, 'b2ad073a0c093706e5dfdfe2c9864d199ed921e49ea0383a7d0013e2ad8a81c8'],
      ['llama-b12211/llama-gemma3-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-gguf-split', 48264, '6403bd864b61404f9aebd75443a6bc53acf888c5ca4740cab547e82ca5237fa3'],
      ['llama-b12211/llama-imatrix', 221240, '3839fa92a91be021cc1b54fa9f24cf3acb3d7d8e27424473280861c62a058813'],
      ['llama-b12211/llama-llava-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-minicpmv-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-mtmd-cli', 101376, '987647dc4f803b2283e6608d703b5ad999b3de288ef335993fdac5558d0046a6'],
      ['llama-b12211/llama-mtmd-debug', 54376, '4ac17551e9d30319029f6b6444e71e8531849b72220db368f61bd395b5b1e823'],
      ['llama-b12211/llama-perplexity', 15968, '1c06240ed8594fd377d655aef2dab0865431e3e779c06638474c96b38e6d74a0'],
      ['llama-b12211/llama-quantize', 17864, 'afafb6cfcc44dec75886679ad7073990bddf396ad27b3bb83a8c3f44b968f4bc'],
      ['llama-b12211/llama-qwen2vl-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-results', 50264, 'e17621d21da273c743b3d510060a4def100a94b41a8f9f732eaaa0bb08a9f0f7'],
      ['llama-b12211/llama-server', 17864, '8afc02770c629ac70518a73a61cc20eaf425b4f3f5510a5f961a8094471bae0c'],
      ['llama-b12211/llama-tokenize', 45168, '7c3f70571062369fc096448742930ac934a7693473826fc7131186368946806e'],
      ['llama-b12211/llama-tts', 49928, 'b8cecb8b65c8816bcd99b40c35296a9a5d489967507de8a21258533239b42b78'],
      ]) }),
    'linux-x64-vulkan': Object.freeze({ asset: 'llama-b12211-bin-ubuntu-vulkan-x64.tar.gz', size: 35924677, sha256: '9759acd293d3738f39d3ceed740bd3125d87dfb492ef8c4f00114d3393d37942', kind: 'tgz', exe: 'llama-b12211/llama-server',
      files: Object.freeze([
      ['llama-b12211/LICENSE', 1078, '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d'],
      ['llama-b12211/ggml-rpc-server', 195536, 'e4ed7b961c67f9abf6b91c9409714c3a0154869d00fbfcf1f1e67f2a61dc89f5'],
      ['llama-b12211/libggml-base.so.0.29.0', 946176, '618aae472f7b041d2efab58d86c6471263d503bf7c4cc5ea40dd6b91ff5fc2a4', 'libggml-base.so.0'],
      ['llama-b12211/libggml-cpu-alderlake.so', 1455736, 'ae990ef0ac6f28a4b13a89e613c551b77694db16bf01332baf82619c107700b5'],
      ['llama-b12211/libggml-cpu-cannonlake.so', 1618752, '777d4395e2a4ad70059d7c06f77856e8552e4d6b12dcd7d15919a52498729fea'],
      ['llama-b12211/libggml-cpu-cascadelake.so', 1630744, '2fe006a3e958e0ce01e611f10e76066db7bcede4e25eebcddbaa871527ca2232'],
      ['llama-b12211/libggml-cpu-cooperlake.so', 1630816, 'bb9ae0899202ca1c0ad5e0f23c5b09f179cc48cbf1e8af6d581c2c8caef8af03'],
      ['llama-b12211/libggml-cpu-haswell.so', 1459832, 'da288889750392560dd4b922f3cdaee88567cc1aedb7f525a2e415ed280a47cd'],
      ['llama-b12211/libggml-cpu-icelake.so', 1630744, 'd1ce43ffcd6d3ecc3581b611297b3fd24a99234a536827de435815309845e110'],
      ['llama-b12211/libggml-cpu-ivybridge.so', 1399552, '9aae18a31f1ea5a3aa881c3b96e6cbe558d4cde682b6acf0bd2916d928510694'],
      ['llama-b12211/libggml-cpu-piledriver.so', 1391360, 'ff6f486b7486eb4a7b661d3c0336138fba2481118a4813be40f790267a80f626'],
      ['llama-b12211/libggml-cpu-sandybridge.so', 1372904, '4fcbcfe781d6df24b37e06500a164086506afc0542d2690238618261120a59a5'],
      ['llama-b12211/libggml-cpu-sapphirerapids.so', 1897152, 'c5c16b23805b8c5fc7817ee277657f59ab882269391ab9f611fd6b75dcb5839a'],
      ['llama-b12211/libggml-cpu-skylakex.so', 1618752, '55d53dbaa0f19015d27c576c5c57683b21a453ee95490192b9ece7e72c9d8dd8'],
      ['llama-b12211/libggml-cpu-sse42.so', 980544, '073800a428bf19ef9c37fc7cbc55451f2ecae6f7beb37d1c0447bd17f6e15ef4'],
      ['llama-b12211/libggml-cpu-x64.so', 976568, '25f93d8f3119d5b656144290bf5d2125a10f6bcbf54a3f9135b312c9900883c7'],
      ['llama-b12211/libggml-cpu-zen4.so', 1630816, 'aaa1b6db727c1ecd62a53462674df544e1005fb46b2fd6d1c884f52b300b1b38'],
      ['llama-b12211/libggml-rpc.so', 328896, '7d0e1cbca812f494de3da87ab17a89899067257d55b3d212d850c9a738ac0f6d'],
      ['llama-b12211/libggml-vulkan.so', 41213944, '9a6a6fa16ccb3334004c1a31bd69cb1904d88caeacd6218e0fdd3e4c540ec3c8'],
      ['llama-b12211/libggml.so.0.29.0', 51040, '8643a58bb37af6fb153e2ea98b48efa227855725ee51c05f4ca76b9867956463', 'libggml.so.0'],
      ['llama-b12211/libllama-batched-bench-impl.so', 48904, 'd97ce0d9ba48c4018080a21a24b5429044fe8b0fa2ea47a8a9f8bd2ba2608765'],
      ['llama-b12211/libllama-bench-impl.so', 490560, '389bc4f02f645051f8adae70ab961a5d5ca43732ec159cba276152d88f22e6ac'],
      ['llama-b12211/libllama-cli-impl.so', 277032, 'bf0ba08ae38c92cf82fe0e353d79c2c20d754a5b82f566473799d386140c7338'],
      ['llama-b12211/libllama-common.so.0.9.0', 6783104, '0abc2030d83d393613d735b3eee3a16c1e00c5715bc8b983c643282cdf675b8a', 'libllama-common.so.0'],
      ['llama-b12211/libllama-completion-impl.so', 144864, '7db937c248af4d5c893ae8c05e274c1f1c1186f394e6ba7e487fd0b9618d193c'],
      ['llama-b12211/libllama-fit-params-impl.so', 39760, 'e21853f79111c4ed082de1570e3966045feb83d62a1d5361e91a5a8dc102a2b8'],
      ['llama-b12211/libllama-perplexity-impl.so', 171912, 'f298a5e98852c319b9e956da06ee6660f19366d9d67ca2fdeebbc95d7be3d82b'],
      ['llama-b12211/libllama-quantize-impl.so', 81840, '79d821e4e88ebc408f52a1b3d7d13f44aeb6f71bba13574e7d395608b671775a'],
      ['llama-b12211/libllama-server-impl.so', 8296336, 'd351c1313224cf689aec6b03a94cbad779d40d28bc9b6b59cdd7009b85362dc4'],
      ['llama-b12211/libllama.so.0.9.0', 5495696, '628b0c43bf91a40547be46bdb338dc13540e6cb2a77bb6ab524312a63e90d14f', 'libllama.so.0'],
      ['llama-b12211/libmtmd.so.0.9.0', 2314600, 'e16863911c56b0295a29f8dfec02b010a426dccdbf599d47bfb9b1beecb58689', 'libmtmd.so.0'],
      ['llama-b12211/llama', 62376, '5e541f9a66089fe7bd09b272880bf390b38e68dda84e10fecf47ab488703594c'],
      ['llama-b12211/llama-batched-bench', 15976, '3b70e62c5c5cf43c8c436622a845ad4b80c01837d6ba3a10c90e39b219bbd2ab'],
      ['llama-b12211/llama-bench', 17864, 'cf1b38c10444d9426a600e318035b2b247f9ad5f1279de4b0c42894aee098cf2'],
      ['llama-b12211/llama-cli', 1511440, 'd6cc36e5fdc2eedd6e052dc7eb1e29d21065331e37e31f57ab2ca4720635dba2'],
      ['llama-b12211/llama-completion', 15968, '7119bef261611b26f326f7c4da4dc3fdeb7bb28e2faf1ec392bda7b21215ef52'],
      ['llama-b12211/llama-connect', 9729072, '0f57652dee1df5a5d69dfb11a8775f864345cfb881b2bd34c6ca6c409ce73d25'],
      ['llama-b12211/llama-fit-params', 15968, 'b2ad073a0c093706e5dfdfe2c9864d199ed921e49ea0383a7d0013e2ad8a81c8'],
      ['llama-b12211/llama-gemma3-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-gguf-split', 48264, '6403bd864b61404f9aebd75443a6bc53acf888c5ca4740cab547e82ca5237fa3'],
      ['llama-b12211/llama-imatrix', 221240, '3839fa92a91be021cc1b54fa9f24cf3acb3d7d8e27424473280861c62a058813'],
      ['llama-b12211/llama-llava-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-minicpmv-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-mtmd-cli', 101376, '987647dc4f803b2283e6608d703b5ad999b3de288ef335993fdac5558d0046a6'],
      ['llama-b12211/llama-mtmd-debug', 54376, '4ac17551e9d30319029f6b6444e71e8531849b72220db368f61bd395b5b1e823'],
      ['llama-b12211/llama-perplexity', 15968, '1c06240ed8594fd377d655aef2dab0865431e3e779c06638474c96b38e6d74a0'],
      ['llama-b12211/llama-quantize', 17864, 'afafb6cfcc44dec75886679ad7073990bddf396ad27b3bb83a8c3f44b968f4bc'],
      ['llama-b12211/llama-qwen2vl-cli', 16952, '053ff1b820407b8a1836b0b05d1ffcc91e56b6531f08d9b00b8dfb97a41de294'],
      ['llama-b12211/llama-results', 50264, 'e17621d21da273c743b3d510060a4def100a94b41a8f9f732eaaa0bb08a9f0f7'],
      ['llama-b12211/llama-server', 17864, '8afc02770c629ac70518a73a61cc20eaf425b4f3f5510a5f961a8094471bae0c'],
      ['llama-b12211/llama-tokenize', 45168, '7c3f70571062369fc096448742930ac934a7693473826fc7131186368946806e'],
      ['llama-b12211/llama-tts', 49928, 'b8cecb8b65c8816bcd99b40c35296a9a5d489967507de8a21258533239b42b78'],
      ]) }),
    // Spec 0003 M3: one macOS arm64 archive serves both keys; Metal or CPU is picked by the server's arguments.
    'darwin-arm64-metal': MACOS_ARCHIVE,
    'darwin-arm64-cpu': MACOS_ARCHIVE,
  }),
});

/** The model (S5): a full commit, by sha256. */
export const MODEL = Object.freeze({
  repo: 'ggml-org/Clef-Flash-GGUF',
  commit: 'c3d925454595d792d5333da8b35f3c09911f7568',
  file: 'Clef-Flash-Q4_K_M.gguf',
  size: 6732781824,
  sha256: 'eef2968c238a80d49d340430f22410ea3db9934ad1c6fdb233a503cbf9a9b54e',
});

/** Where each download may start, and the hosts a redirect may land on (S5). */
export const SOURCES = Object.freeze({
  server: Object.freeze({ origin: 'https://github.com', redirects: Object.freeze(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']) }),
  model: Object.freeze({ origin: 'https://huggingface.co', redirects: Object.freeze(['us.aws.cdn.hf.co']) }),
});

// The only two repos a pin may name. A test holds both names as its own constants.
const SERVER_REPO = 'ggml-org/llama.cpp';
const MODEL_REPO = 'ggml-org/Clef-Flash-GGUF';
const PLATFORM_KEYS = Object.freeze(['win32-x64-cpu', 'win32-x64-vulkan', 'linux-x64-cpu', 'linux-x64-vulkan', 'darwin-arm64-metal', 'darwin-arm64-cpu']);

const MAX_REDIRECTS = 4;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const TAG_RE = /^b[0-9]+$/;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const RESERVED_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

/** A refusal: `code` is the fixed word the output names. */
export class Refused extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------- the shape check (S5)

/**
 * Why a path inside an archive, or a kept file's name, is not allowed, or null.
 * Empty, absolute, `..`, a backslash, any `:`, a NUL or control character, a
 * segment ending in a dot or a space, or a segment that is a Windows reserved
 * name (any case, any extension).
 */
export function pathProblem(path) {
  if (typeof path !== 'string' || path === '') return 'empty';
  if (path.startsWith('/')) return 'absolute';
  if (path.includes('\\')) return 'backslash';
  if (path.includes(':')) return 'colon';
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'control';
  for (const seg of path.split('/')) {
    if (seg === '') return 'empty';
    if (seg.includes('..')) return 'dotdot';
    if (/[. ]$/.test(seg)) return 'trailing';
    if (RESERVED_RE.test(seg)) return 'reserved';
  }
  return null;
}

const plainSegment = s => typeof s === 'string' && SEGMENT_RE.test(s) && s !== '.' && !s.includes('..');

/**
 * The shape check on the pin table: a list of rule ids, empty when it holds.
 * `repos` is the pair the tool and its gate test both hold: moving a source
 * changes a test too.
 */
export function pinProblems(server = SERVER, model = MODEL, repos = { server: SERVER_REPO, model: MODEL_REPO }) {
  const out = [];
  if (server.repo !== repos.server) out.push('server-repo');
  if (model.repo !== repos.model) out.push('model-repo');
  if (typeof server.tag !== 'string' || !TAG_RE.test(server.tag)) out.push('tag');
  if (typeof model.commit !== 'string' || !HEX40.test(model.commit)) out.push('commit');
  if (!plainSegment(model.file)) out.push('model-file');
  if (typeof model.sha256 !== 'string' || !HEX64.test(model.sha256)) out.push('model-sha256');
  if (!Number.isSafeInteger(model.size) || model.size <= 0) out.push('model-size');
  const keys = Object.keys(server.archives ?? {});
  for (const key of keys) {
    const a = server.archives[key];
    if (!PLATFORM_KEYS.includes(key)) out.push('platform-key');
    if (!plainSegment(a.asset) || (typeof server.tag === 'string' && !a.asset.startsWith(`llama-${server.tag}-bin-`))) out.push('asset');
    if (typeof a.sha256 !== 'string' || !HEX64.test(a.sha256)) out.push('sha256');
    if (!Number.isSafeInteger(a.size) || a.size <= 0) out.push('size');
    if (a.kind !== 'zip' && a.kind !== 'tgz') out.push('kind');
    const rows = Array.isArray(a.files) ? a.files : [];
    const dests = new Set();
    for (const row of rows) {
      const [path, size, sha, ...copies] = Array.isArray(row) ? row : [];
      if (pathProblem(path) !== null) out.push('file-path');
      if (!Number.isSafeInteger(size) || size < 1) out.push('file-size');
      if (typeof sha !== 'string' || !HEX64.test(sha)) out.push('file-sha256');
      if (copies.length > 1 || copies.some(c => !plainSegment(c))) out.push('file-copy');
      for (const dest of typeof path === 'string' ? destNames(row, a.exe) : ['']) {
        if (dests.has(dest)) out.push('file-dup');
        dests.add(dest);
      }
    }
    if (rows.length && !rows.some(r => r[0] === a.exe)) out.push('exe');
    // Spec 0003 M3: two keys may name one asset only when their rows are equal field for field.
    if (keys.some(k => k !== key && server.archives[k].asset === a.asset && JSON.stringify(server.archives[k]) !== JSON.stringify(a))) out.push('asset-shared');
  }
  return [...new Set(out)];
}

/** Throws `clef-pin` when the table fails the shape check. */
export function assertPins(server = SERVER, model = MODEL, repos) {
  const bad = pinProblems(server, model, repos);
  if (bad.length) throw new Refused('clef-pin', `the pin table fails its shape check: ${bad.join(', ')}`);
}

/**
 * Where a kept file lands under runtime/<tag>/: its path inside the folder that
 * holds `exe`, or its plain name when it sits elsewhere in the archive (the
 * LICENSE).
 */
export function destName(path, exe) {
  const dir = exe.includes('/') ? exe.slice(0, exe.lastIndexOf('/') + 1) : '';
  return dir && path.startsWith(dir) ? path.slice(dir.length) : path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Every name a row's bytes are kept under: its own, then its copy. A row's
 * optional fourth item is one plain name, for a library the Linux build holds
 * under its soname as a link; a link is never written, so the bytes are kept
 * as a second, regular file.
 */
export const destNames = (row, exe) => [destName(row[0], exe), ...row.slice(3)];

// ---------------------------------------------------------------- the built URLs (S5)

function checkedUrl(raw, prefix) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.search !== '' || u.hash !== '' || !u.pathname.startsWith(prefix)) throw new Refused('clef-pin', 'a built URL leaves its repo, tag or commit');
  return u;
}

/** A server archive's URL, built from the table and checked after building. */
export function archiveUrl(server, key) {
  const a = server.archives[key];
  if (!a) throw new Refused('clef-platform', `the pin table has no archive for ${key}`);
  if (!plainSegment(a.asset) || !TAG_RE.test(server.tag)) throw new Refused('clef-pin', 'a pin names a file or tag that is not one plain segment');
  return checkedUrl(`${SOURCES.server.origin}/${server.repo}/releases/download/${server.tag}/${a.asset}`, `/${server.repo}/releases/download/${server.tag}/`);
}

/** The model's URL, built from the table and checked after building. */
export function modelUrl(model) {
  if (!plainSegment(model.file) || !HEX40.test(model.commit)) throw new Refused('clef-pin', 'a pin names a file or commit that is not one plain segment');
  return checkedUrl(`${SOURCES.model.origin}/${model.repo}/resolve/${model.commit}/${model.file}`, `/${model.repo}/resolve/${model.commit}/`);
}

// ---------------------------------------------------------------- the fetch (S6)

/** One request, no proxy, no cookie, no token: each call makes its own agent. */
export function makeTransport(https = { request: httpsRequest, Agent }) {
  return (url, headers) => new Promise((resolveReq, reject) => {
    const req = https.request(url, { method: 'GET', headers, agent: new https.Agent({ keepAlive: false }), timeout: 60_000 }, res => resolveReq({ status: res.statusCode, headers: res.headers, body: res }));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const BASE_HEADERS = Object.freeze({ 'user-agent': 'pact-clef-setup', 'accept-encoding': 'identity' });

/** Hashes a file by streaming it from disk; returns its sha256 and size. */
export function hashFile(path) {
  const h = createHash('sha256');
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    let n = 0;
    for (let got; (got = readSync(fd, buf, 0, buf.length, null)) > 0;) {
      h.update(buf.subarray(0, got));
      n += got;
    }
    return { sha256: h.digest('hex'), size: n };
  } finally {
    closeSync(fd);
  }
}

/**
 * Fetches one pinned file to `out`, which holds the bytes so far when `resume`
 * is set. A redirect is followed only to an absolute `https:` URL whose host is
 * the request's own or on the source's redirect list, at most 4 times; a
 * relative one resolves against the current URL and meets the same rule. A byte
 * past `size` aborts. The whole file is hashed from disk at the end. A refusal
 * deletes `out`. Resolves { ok: true } or throws Refused (`clef-redirect`,
 * `clef-size`, `clef-hash`) or Error (`network`, `status`).
 */
export async function fetchFile({ url, source, size, sha256, out, transport, sources = SOURCES, resume = false }) {
  const src = sources[source];
  const allowed = new Set([new URL(src.origin).host, ...src.redirects]);
  const start = resume && existsSync(out) ? statSync(out).size : 0;
  const fail = (code, msg) => {
    rmSync(out, { force: true });
    throw new Refused(code, msg);
  };
  // A partial already the pinned size was fully fetched: check it, never ask for bytes past its end.
  if (start === size && size > 0) {
    const h = hashFile(out);
    if (h.sha256 === sha256) return { ok: true };
  }
  if (start >= size) rmSync(out, { force: true });
  let from = start >= size ? 0 : start;
  let current = new URL(url);
  let res;
  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) fail('clef-redirect', 'too many redirects');
    const headers = from > 0 ? { ...BASE_HEADERS, range: `bytes=${from}-` } : { ...BASE_HEADERS };
    res = await transport(current, headers);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      res.body?.resume?.();
      const loc = res.headers.location;
      if (!loc) fail('clef-redirect', 'a redirect with no address');
      let next;
      try {
        next = new URL(loc, current);
      } catch {
        fail('clef-redirect', 'a redirect with no usable address');
      }
      if (next.protocol !== 'https:' || !allowed.has(next.host)) fail('clef-redirect', 'a redirect to a host or scheme that is not listed');
      current = next;
      continue;
    }
    break;
  }
  if (res.status !== 200 && res.status !== 206) {
    res.body?.resume?.();
    rmSync(out, { force: true });
    throw new Error(`status ${res.status}`);
  }
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  // A 200 to a range request is a server that ignored it: restart the file.
  const appending = res.status === 206 && from > 0;
  if (res.status === 206 && !appending) fail('clef-size', 'a partial answer to a request that asked for the whole file');
  const fd = openSync(out, appending ? 'a' : 'w', 0o600);
  let n = appending ? from : 0;
  try {
    for await (const chunk of res.body) {
      n += chunk.length;
      if (n > size) {
        res.body.destroy?.();
        throw new Refused('clef-size', 'more bytes than the pinned size');
      }
      writeSync(fd, chunk);
    }
  } catch (e) {
    closeSync(fd);
    if (e instanceof Refused) {
      rmSync(out, { force: true });
      throw e;
    }
    // A broken connection keeps the bytes so far for a resumed fetch.
    throw new Error('network');
  }
  closeSync(fd);
  if (n !== size) {
    // Short: a model's partial is kept for a resume; anything else is refused and deleted.
    if (!resume) fail('clef-size', 'fewer bytes than the pinned size');
    throw new Error('network');
  }
  const got = hashFile(out);
  if (got.size !== size) fail('clef-size', 'the file on disk is not the pinned size');
  if (got.sha256 !== sha256) fail('clef-hash', 'the file does not match its pinned sha256');
  return { ok: true };
}

// ---------------------------------------------------------------- archive readers (S6)

const bad = msg => new Refused('clef-archive', msg);

/**
 * The entries of a zip, as { path, kind: 'file' | 'dir' | 'link', data }, and
 * the entry forms it used. Stored and deflate only; zip64, encryption and any
 * other method refuse. `data` is read only for a regular file and only when
 * `want(path)` says so. Every entry name goes through pathProblem.
 */
export function readZip(buf, { maxBytes, want = () => true } = {}) {
  const limit = maxBytes ?? buf.length * 1000;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw bad('no zip end record');
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === 0x07064b50) throw bad('zip64');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw bad('zip64');
  if (cdOff + cdSize > eocd) throw bad('the central directory is out of range');
  const entries = [];
  const forms = new Set();
  let p = cdOff;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw bad('a bad central directory entry');
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const ext = buf.readUInt32LE(p + 38);
    const lho = buf.readUInt32LE(p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) throw bad('zip64');
    if (flags & 1) throw bad('an encrypted entry');
    const name = buf.toString('latin1', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    const isDir = name.endsWith('/');
    const unixMode = (madeBy >> 8) === 3 ? (ext >>> 16) & 0o170000 : 0;
    const kind = isDir ? 'dir' : unixMode === 0o120000 ? 'link' : unixMode !== 0 && unixMode !== 0o100000 ? 'other' : 'file';
    const checked = isDir ? name.slice(0, -1) : name;
    if (pathProblem(checked) !== null) throw bad('an entry name that fails the path check');
    forms.add(`${kind}:${method === 0 ? 'stored' : method === 8 ? 'deflate' : `method-${method}`}`);
    if (kind === 'other') throw bad('an entry that is not a file, a folder or a link');
    const entry = { path: checked, kind, data: null };
    if (kind === 'file') {
      if (method !== 0 && method !== 8) throw bad('a compression method this reader does not read');
      if (want(checked)) {
        total += usize;
        if (total > limit) throw bad('the archive unpacks past its limit');
        if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) throw bad('a bad local header');
        const dataAt = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
        const raw = buf.subarray(dataAt, dataAt + csize);
        if (raw.length !== csize) throw bad('an entry runs past the end of the file');
        let data;
        try {
          data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: usize + 1 });
        } catch {
          throw bad('an entry that does not inflate');
        }
        if (data.length !== usize) throw bad('an entry whose size differs from its header');
        entry.data = data;
      }
    }
    entries.push(entry);
  }
  return { entries, forms: [...forms].sort() };
}

const octal = (buf, from, to) => parseInt(buf.toString('latin1', from, to).replace(/\0.*$/, '').trim() || '0', 8);

/** The pax keys the tar reader ignores (spec 0003 M4): none changes an entry's name, link, size or bytes. */
const PAX_QUIET = /^(?:SCHILY\.xattr\..+|LIBARCHIVE\..+|mtime|atime|ctime)$/;

/** Checks a pax header's records ("<length> <key>=<value>\n", the length counting the whole record); refuses unless every key is a quiet one. */
function paxQuiet(body) {
  let at = 0;
  while (at < body.length) {
    if (body[at] === 0) break;
    const sp = body.indexOf(0x20, at);
    const len = sp > at ? Number(body.toString('latin1', at, sp)) : NaN;
    if (!/^[1-9]\d*$/.test(body.toString('latin1', at, sp)) || at + len > body.length || body[at + len - 1] !== 0x0a) throw bad('a pax header that does not read');
    const rec = body.toString('utf8', sp + 1, at + len - 1);
    const eq = rec.indexOf('=');
    if (eq < 1 || !PAX_QUIET.test(rec.slice(0, eq))) throw bad('a pax header');
    at += len;
  }
}

/**
 * The entries of a gzipped ustar tar, as { path, kind, data }, and the entry
 * forms it used. A pax header with any key but PAX_QUIET's, a GNU long name and any type but a regular file,
 * a folder or a link refuse. Every entry name goes through pathProblem
 * (a leading `./` is dropped first).
 */
export function readTgz(tgz, { maxBytes, want = () => true } = {}) {
  let buf;
  try {
    buf = gunzipSync(tgz, { maxOutputLength: maxBytes ?? tgz.length * 1000 });
  } catch {
    throw bad('a tar.gz that does not inflate');
  }
  const entries = [];
  const forms = new Set();
  let off = 0;
  while (off + 512 <= buf.length) {
    const head = buf.subarray(off, off + 512);
    if (head.every(b => b === 0)) break;
    const name = head.toString('latin1', 0, 100).replace(/\0.*$/, '');
    const magic = head.toString('latin1', 257, 262);
    const prefix = magic === 'ustar' ? head.toString('latin1', 345, 500).replace(/\0.*$/, '') : '';
    const full = prefix ? `${prefix}/${name}` : name;
    const size = octal(head, 124, 136);
    const type = String.fromCharCode(head[156] || 48);
    off += 512;
    if (type === 'x' || type === 'g') {
      // Spec 0003 M4: a pax header of either kind holding only xattr, LIBARCHIVE and time keys is read and ignored; any other key refuses.
      if (off + size > buf.length) throw bad('an entry runs past the end of the file');
      paxQuiet(buf.subarray(off, off + size));
      off += Math.ceil(size / 512) * 512;
      continue;
    }
    if (type === 'L' || type === 'K') throw bad('a GNU long name');
    if (!['0', '5', '1', '2'].includes(type)) throw bad('an entry that is not a file, a folder or a link');
    const kind = type === '0' ? 'file' : type === '5' ? 'dir' : 'link';
    let path = full.startsWith('./') ? full.slice(2) : full;
    if (kind === 'dir') path = path.replace(/\/$/, '');
    if (path === '' || path === '.') {
      off += Math.ceil(size / 512) * 512;
      continue;
    }
    if (pathProblem(path) !== null) throw bad('an entry name that fails the path check');
    forms.add(`${kind}:ustar`);
    const entry = { path, kind, data: null };
    if (kind === 'link') entry.target = head.toString('latin1', 157, 257).replace(/\0.*$/, '');
    if (kind === 'file') {
      if (off + size > buf.length) throw bad('an entry runs past the end of the file');
      if (want(path)) entry.data = Buffer.from(buf.subarray(off, off + size));
      off += Math.ceil(size / 512) * 512;
    }
    entries.push(entry);
  }
  return { entries, forms: [...forms].sort() };
}

/** Reads an archive by its kind. */
export const readArchive = (kind, buf, opts) => (kind === 'zip' ? readZip(buf, opts) : readTgz(buf, opts));

// ---------------------------------------------------------------- the clef folder and the platform (S3, S6)

/**
 * The Claude home folder: CLAUDE_CONFIG_DIR when set, which must be an absolute
 * path (clef-home otherwise, never a quiet fall-back that would move the clef
 * folder with the start folder), else ~/.claude. A cloned repo's own settings
 * can set it, so the folder it names is checked again with links resolved:
 * assertRealFolders refuses one inside the starting folder.
 */
export const claudeHome = (env = process.env, home = homedir(), win = process.platform === 'win32') => {
  const v = env.CLAUDE_CONFIG_DIR;
  if (!v) return join(home, '.claude');
  if (win ? !/^[A-Za-z]:[\\/]/.test(v) : !posix.isAbsolute(v)) throw new Refused('clef-home', 'CLAUDE_CONFIG_DIR is set but is not an absolute path' + (win ? ' with a drive letter' : ''));
  return resolve(v);
};

/**
 * The user's home folder from the account record (the passwd entry, or the
 * profile folder Windows keeps for the account), never from HOME or USERPROFILE,
 * which a cloned repo's settings can set. Null when the record cannot be read.
 */
export function accountHome() {
  try {
    const h = userInfo().homedir;
    return typeof h === 'string' && h !== '' ? h : null;
  } catch {
    return null;
  }
}

/** The clef folder (S3). */
export const clefDir = home => join(home, 'pact-clef');

/** The Vulkan probe (S6): looks for a loader file, runs nothing. */
export function probeVulkan({ platform, exists = existsSync, systemRoot = process.env.SystemRoot ?? 'C:\\Windows' }) {
  if (platform === 'win32') return exists(join(systemRoot, 'System32', 'vulkan-1.dll'));
  return ['/usr/lib', '/usr/lib64', '/usr/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu'].some(d => exists(`${d}/libvulkan.so.1`));
}

/** The platform key and why, or null when no archive fits. */
export function pickPlatform({ platform, arch, vulkan, cpu }) {
  // Spec 0003 M4: every Apple Silicon Mac has Metal, so no probe decides it.
  if (platform === 'darwin') return arch === 'arm64' ? { key: `darwin-arm64-${cpu ? 'cpu' : 'metal'}`, backend: cpu ? 'cpu' : 'metal', why: cpu ? 'CPU forced by --cpu' : 'Apple Silicon: Metal' } : null;
  const os = platform === 'win32' ? 'win32' : platform === 'linux' ? 'linux' : null;
  if (!os || arch !== 'x64') return null;
  const useVulkan = vulkan && !cpu;
  return { key: `${os}-x64-${useVulkan ? 'vulkan' : 'cpu'}`, backend: useVulkan ? 'vulkan' : 'cpu', why: cpu ? 'CPU forced by --cpu' : vulkan ? 'Vulkan loader found' : 'no Vulkan loader: CPU' };
}

// ---------------------------------------------------------------- setup (S6)

const mb = n => `${(n / 1e6).toFixed(1)} MB`;

/** Whether `child` is `parent` or below it, by the platform's own rules (Windows compares without case). */
const insideOf = (child, parent, win) => {
  const P = win ? win32 : posix;
  const rel = P.relative(P.resolve(parent), P.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel));
};

const realOf = p => realpathSync.native(p);

/**
 * Before the clef folder is made: refuses (`clef-home`) one that, with links
 * resolved, would lie inside the folder the command was started from, judged
 * on its nearest existing ancestor, so a refusal leaves nothing behind. A
 * start folder that does not resolve is refused too.
 */
export function assertOutsideStart(dir, cwd, win = process.platform === 'win32') {
  let start;
  try {
    start = realOf(cwd);
  } catch {
    throw new Refused('clef-home', 'the folder the command was started from does not resolve');
  }
  let ancestor = resolve(dir);
  while (!existsSync(ancestor)) {
    const up = dirname(ancestor);
    if (up === ancestor) throw new Refused('clef-home', 'the clef folder has no existing parent');
    ancestor = up;
  }
  const real = join(realOf(ancestor), (win ? win32 : posix).relative(ancestor, resolve(dir)));
  if (insideOf(real, start, win)) throw new Refused('clef-home', 'the clef folder lies inside the folder the command was started from');
}

/**
 * After it is made: refuses (`clef-home`) one whose runtime, models or partial
 * folder is a link (prune deletes in those, and setup writes there), and, with
 * `checkStart`, one that now resolves inside the starting folder.
 */
export function assertRealFolders(dir, cwd, { checkStart = false, win = process.platform === 'win32' } = {}) {
  let real;
  try {
    real = realOf(dir);
  } catch {
    throw new Refused('clef-home', 'the clef folder does not resolve to a real folder');
  }
  if (checkStart) assertOutsideStart(real, cwd, win);
  for (const sub of ['runtime', 'models', 'partial']) {
    let s;
    try {
      s = lstatSync(join(dir, sub));
    } catch {
      continue;
    }
    if (s.isSymbolicLink()) throw new Refused('clef-home', `${sub} in the clef folder is a link`);
  }
}

function readSetup(dir) {
  try {
    const j = JSON.parse(readFileSync(join(dir, 'setup.json'), 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

/** The folders under the clef folder. */
export const paths = (dir, server = SERVER, model = MODEL) => ({
  runtime: join(dir, 'runtime', server.tag),
  runtimePartial: join(dir, 'runtime', `${server.tag}.partial`),
  models: join(dir, 'models'),
  model: join(dir, 'models', `${model.sha256}.gguf`),
  partial: join(dir, 'partial'),
  setup: join(dir, 'setup.json'),
});

/** Whether the kept server files are all there at their pinned sizes, and setup.json agrees. */
function serverPresent(dir, key, server, setup) {
  if (!setup || setup.tag !== server.tag || setup.platform !== key) return false;
  const a = server.archives[key];
  const p = paths(dir, server);
  return a.files.length > 0 && a.files.every(row => destNames(row, a.exe).every(name => {
    try {
      return statSync(join(p.runtime, name)).size === row[1];
    } catch {
      return false;
    }
  }));
}

function modelPresent(dir, model, setup) {
  if (!setup || setup.model !== model.sha256) return false;
  try {
    return statSync(paths(dir, SERVER, model).model).size === model.size;
  } catch {
    return false;
  }
}

/**
 * The plan: what setup would do, as lines and data. Writes nothing but the
 * clef folder. Throws Refused (`clef-platform`, `clef-space`, `clef-node`,
 * `clef-setpriv`, `clef-pin`).
 */
export function planSetup({ dir, platform, arch, cpu = false, execPath, cwd, free, exists = existsSync, vulkan, server = SERVER, model = MODEL }) {
  assertPins(server, model);
  if (platform === 'darwin' && arch !== 'arm64') throw new Refused('clef-platform', 'no build for Intel Macs; on Apple Silicon, run setup with an arm64 node, not one under Rosetta');
  const pick = pickPlatform({ platform, arch, vulkan: platform === 'darwin' ? false : vulkan ?? probeVulkan({ platform, exists }), cpu });
  if (!pick || !server.archives[pick.key]) throw new Refused('clef-platform', `no pinned server build for ${platform} ${arch}`);
  if (platform === 'linux' && !exists('/usr/bin/setpriv')) throw new Refused('clef-setpriv', 'Linux needs /usr/bin/setpriv, which this machine does not have');
  if (insideOf(execPath, cwd, platform === 'win32')) throw new Refused('clef-node', 'the node that runs setup lies inside the folder the command was started from');
  const a = server.archives[pick.key];
  const setup = readSetup(dir);
  const haveServer = serverPresent(dir, pick.key, server, setup);
  const haveModel = modelPresent(dir, model, setup);
  const need = (haveServer ? 0 : a.size) + (haveModel ? 0 : model.size);
  const needed = Math.ceil((need + (haveServer ? 0 : a.files.reduce((s, f) => s + f[1] * (f.length > 3 ? 2 : 1), 0))) * 1.1);
  if (free < needed) throw new Refused('clef-space', `the clef folder's drive has ${mb(free)} free and setup needs ${mb(needed)}`);
  const lines = [`platform: ${pick.key} (${pick.why})`, `clef folder: ${quote(dir)}`];
  const items = [];
  if (haveServer) lines.push(`present (sizes match), skipped unless its sha256 fails: server ${server.tag} (${pick.key})`);
  else {
    const u = archiveUrl(server, pick.key);
    items.push({ what: 'server', key: pick.key, host: u.host, url: u.href });
    lines.push(`fetch: ${u.host} ${a.asset} ${mb(a.size)} sha256 ${a.sha256.slice(0, 8)}`);
  }
  if (haveModel) lines.push(`present (size matches), skipped unless its sha256 fails: model ${model.sha256.slice(0, 8)}`);
  else {
    const u = modelUrl(model);
    items.push({ what: 'model', host: u.host, url: u.href });
    lines.push(`fetch: ${u.host} ${model.file} ${mb(model.size)} sha256 ${model.sha256.slice(0, 8)}`);
  }
  lines.push(`free space: ${mb(free)}; needs ${mb(needed)}`);
  lines.push(`node recorded in setup.json: ${execPath}`);
  return { pick, items, haveServer, haveModel, lines, needed };
}

function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

const sha256Of = buf => createHash('sha256').update(buf).digest('hex');

/**
 * Unpacks the server archive at `archivePath` into runtime/<tag>.partial, then
 * moves it into place (an existing runtime/<tag> is renamed aside, then removed).
 * Only entries named in `files` are written; each is checked again.
 */
export function unpackServer({ dir, key, archivePath, platform, server = SERVER }) {
  const a = server.archives[key];
  const p = paths(dir, server);
  const named = new Map(a.files.map(f => [f[0], f]));
  const { entries } = readArchive(a.kind, readFileSync(archivePath), { maxBytes: a.kind === 'zip' ? a.files.reduce((s, f) => s + f[1], 0) + (1 << 20) : 1 << 30, want: n => named.has(n) });
  rmSync(p.runtimePartial, { recursive: true, force: true });
  mkdirSync(p.runtimePartial, { recursive: true, mode: 0o700 });
  const written = new Set();
  for (const e of entries) {
    const row = named.get(e.path);
    if (!row) continue;
    if (written.has(row[0])) throw bad('a pinned file appears twice in the archive');
    if (e.kind !== 'file') throw bad('a pinned file is not a regular file in the archive');
    if (e.data.length !== row[1] || sha256Of(e.data) !== row[2]) throw new Refused('clef-hash', 'a file from the archive does not match its pinned size and sha256');
    for (const name of destNames(row, a.exe)) {
      const dest = join(p.runtimePartial, name);
      if (!insideOf(dest, p.runtimePartial, process.platform === 'win32') || dest === p.runtimePartial) throw bad('a file would land outside its folder');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, e.data, { flag: 'wx', mode: 0o600 });
    }
    written.add(row[0]);
  }
  for (const row of a.files) if (!written.has(row[0])) throw bad('a pinned file is not in the archive');
  if (platform === 'linux' || platform === 'darwin') chmodSync(join(p.runtimePartial, destName(a.exe, a.exe)), 0o755);
  const aside = `${p.runtime}.old`;
  rmSync(aside, { recursive: true, force: true });
  if (existsSync(p.runtime)) renameWithRetry(p.runtime, aside);
  renameWithRetry(p.runtimePartial, p.runtime);
  rmSync(aside, { recursive: true, force: true });
}

/** Removes runtime folders and model files the table no longer names. */
export function prune(dir, server = SERVER, model = MODEL) {
  const p = paths(dir, server, model);
  const keep = (folder, names) => {
    if (!existsSync(folder)) return;
    for (const n of readdirSync(folder)) if (!names.includes(n)) rmSync(join(folder, n), { recursive: true, force: true });
  };
  keep(join(dir, 'runtime'), [server.tag]);
  keep(p.models, [`${model.sha256}.gguf`]);
  keep(p.partial, []);
}

/**
 * Setup. Without `yes` it prints the plan and fetches nothing. With it, it
 * fetches what the plan lists, checks and unpacks it, prunes what the table no
 * longer names, and writes setup.json last. Returns { lines }.
 */
export async function runSetup(o) {
  const { dir, yes = false, transport, sources = SOURCES, server = SERVER, model = MODEL, platform, execPath } = o;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const plan = planSetup({ ...o, server, model, free: o.free ?? freeBytes(dir) });
  if (!yes) return { lines: [...plan.lines, 'run again with --yes to fetch'], plan };
  const p = paths(dir, server, model);
  const a = server.archives[plan.pick.key];
  const lines = [...plan.lines];
  mkdirSync(p.partial, { recursive: true, mode: 0o700 });
  // A file the plan skipped on its size is hashed now; one that fails is fetched again.
  const failsHash = (path, size, sha) => {
    try {
      const h = hashFile(path);
      return h.size !== size || h.sha256 !== sha;
    } catch {
      return true;
    }
  };
  const haveServer = plan.haveServer && !a.files.some(row => destNames(row, a.exe).some(name => failsHash(join(p.runtime, name), row[1], row[2])));
  const haveModel = plan.haveModel && !failsHash(p.model, model.size, model.sha256);
  if (plan.haveServer) lines.push(haveServer ? `checked: server ${server.tag} (${plan.pick.key})` : `sha256 failed, fetching again: server ${server.tag}`);
  if (plan.haveModel) lines.push(haveModel ? `checked: model ${model.sha256.slice(0, 8)}` : `sha256 failed, fetching again: model ${model.sha256.slice(0, 8)}`);
  if (!haveServer) {
    const out = join(p.partial, a.asset);
    rmSync(out, { force: true });
    await fetchFile({ url: archiveUrl(server, plan.pick.key).href, source: 'server', size: a.size, sha256: a.sha256, out, transport, sources });
    unpackServer({ dir, key: plan.pick.key, archivePath: out, platform, server });
    rmSync(out, { force: true });
    lines.push(`kept: server ${server.tag} (${plan.pick.key})`);
  }
  if (!haveModel) {
    const out = join(p.partial, `${model.sha256}.gguf`);
    await fetchFile({ url: modelUrl(model).href, source: 'model', size: model.size, sha256: model.sha256, out, transport, sources, resume: true });
    mkdirSync(p.models, { recursive: true, mode: 0o700 });
    renameWithRetry(out, p.model);
    lines.push(`kept: model ${model.sha256.slice(0, 8)}`);
  }
  prune(dir, server, model);
  writeFileSync(p.setup, `${JSON.stringify({ platform: plan.pick.key, tag: server.tag, model: model.sha256, backend: plan.pick.backend, node: execPath }, null, 2)}\n`, { mode: 0o600 });
  return { lines, plan };
}

/** Free bytes on the volume that holds `path`, or Infinity when unknown. */
export function freeBytes(path) {
  try {
    const s = statfsSync(path);
    return s.bavail * s.bsize;
  } catch {
    return Infinity;
  }
}

// ---------------------------------------------------------------- verify (S6)

/**
 * Re-hashes every kept file and the model against the table: one line per file,
 * and the failing words. Reads setup.json for the platform.
 */
export function verify({ dir, server = SERVER, model = MODEL }) {
  const setup = readSetup(dir);
  const lines = [];
  const failed = [];
  const check = (label, path, size, sha) => {
    let word = 'ok';
    try {
      const got = hashFile(path);
      if (got.size !== size) word = 'size';
      else if (got.sha256 !== sha) word = 'sha256';
    } catch {
      word = 'missing';
    }
    lines.push(`${word}: ${label}`);
    if (word !== 'ok') failed.push(`${word}:${label}`);
  };
  if (!setup || !server.archives[setup.platform]) {
    lines.push('missing: setup.json');
    failed.push('missing:setup.json');
    return { lines, failed };
  }
  const a = server.archives[setup.platform];
  const p = paths(dir, server, model);
  for (const row of a.files) for (const name of destNames(row, a.exe)) check(name, join(p.runtime, name), row[1], row[2]);
  check(`model ${model.sha256.slice(0, 8)}`, p.model, model.size, model.sha256);
  return { lines, failed };
}

// ---------------------------------------------------------------- the supervisor (S7)

const SETPRIV = '/usr/bin/setpriv';
const IDLE_MS = 30 * 60_000;
const CHECK_MS = 60_000;
const FAIL_BACKOFF_MS = 10 * 60_000;
const START_TIMEOUT_MS = 180_000;
const MAX_BODY = 256 * 1024;
const MAX_REPLY = 1 << 20;
const MAX_QUESTIONS = 64;
const FORWARD_TIMEOUT_MS = 60_000;
const LOG_CAP = 1 << 20;
/** The only names from the caller's environment that reach the supervisor and the server (S7). */
const ENV_PASS = Object.freeze(['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_RUNTIME_DIR']);

/** The files the supervisor keeps in the clef folder. */
export const runPaths = dir => ({ run: join(dir, 'run.json'), lock: join(dir, 'run.lock'), key: join(dir, 'run.key'), fail: join(dir, 'run.fail'), log: join(dir, 'serve.log') });

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unit = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

function readJsonFile(path) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return isObj(j) ? j : null;
  } catch {
    return null;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** One line in serve.log: reason words and counts only, never a body, token, key, header value or argument. The file is capped at 1 MB. */
function logLine(dir, line) {
  try {
    const p = runPaths(dir).log;
    let size = 0;
    try {
      size = statSync(p).size;
    } catch {
      // no log yet
    }
    if (size > LOG_CAP) writeFileSync(p, '', { mode: 0o600 });
    appendFileSync(p, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
  } catch {
    // a log that cannot be written never stops the work
  }
}

function writeFail(dir, reason, now = Date.now) {
  try {
    writeFileSync(runPaths(dir).fail, `${JSON.stringify({ time: now(), reason })}\n`, { mode: 0o600 });
  } catch {
    // nothing to record to
  }
}

/** The environment the supervisor and the server run with: a named list from the caller, a fixed PATH, and on Linux the runtime folder as the library path. */
export function serveEnv(env, platform, runtime) {
  const out = {};
  for (const n of ENV_PASS) if (env[n] !== undefined) out[n] = env[n];
  const root = env.SYSTEMROOT ?? env.SystemRoot ?? 'C:\\Windows';
  out.PATH = platform === 'win32' ? `${root}\\System32;${root}` : '/usr/bin:/bin';
  if (platform === 'linux') out.LD_LIBRARY_PATH = runtime;
  // Spec 0003 M4: TMPDIR names the user's private temp folder on macOS; without it the process falls back to /tmp.
  if (platform === 'darwin' && env.TMPDIR !== undefined) out.TMPDIR = env.TMPDIR;
  return out;
}

/** The supervisor's own environment: the named list, plus CLAUDE_CONFIG_DIR when the caller set it, so `serve` works out the same clef folder as `ensure`. The server never gets it (`serveEnv` does not carry it). */
export function supervisorEnv(env, platform, runtime) {
  const out = serveEnv(env, platform, runtime);
  if (env.CLAUDE_CONFIG_DIR) out.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR;
  return out;
}

/** The server's argument list: fixed in the tool, no part from a caller. The key is in a file, never on the command line. */
export function serverArgs({ port, keyFile, modelPath, vulkan, metal, noDevice }) {
  // --cors-origins names an origin no page has, so a web page cannot read even the server's keyless /health.
  return ['--host', '127.0.0.1', '--port', String(port), '--api-key-file', keyFile, '--no-webui', '--no-slots', '--cors-origins', 'http://127.0.0.1.invalid', ...(vulkan || metal ? ['-ngl', '99'] : []), ...(noDevice ? ['--device', 'none'] : []), '-c', '16384', '-ub', '4096', '-b', '4096', '-m', modelPath];
}

/** The program and arguments that start the server: on Linux through setpriv, so the kernel ends it when the supervisor dies. */
export function launchCommand({ platform, exe, exePrefix = [], args, setpriv = SETPRIV, pdeathsig = true }) {
  if (platform === 'linux' && pdeathsig) return { file: setpriv, args: ['--pdeathsig', 'KILL', '--', exe, ...exePrefix, ...args] };
  return { file: exe, args: [...exePrefix, ...args] };
}

/** One GET or POST to a loopback port: { status, json } (json null when the body is not JSON), or null on any failure. */
function httpJson({ port, path, method = 'GET', token, body, timeoutMs = 5000 }) {
  return new Promise(resolveP => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = { host: `127.0.0.1:${port}`, accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (data) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(data.length);
    }
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers, agent: false, timeout: timeoutMs }, res => {
      const chunks = [];
      let n = 0;
      res.on('data', c => {
        n += c.length;
        if (n > MAX_REPLY) {
          req.destroy();
          resolveP(null);
        } else chunks.push(c);
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          // not JSON
        }
        resolveP({ status: res.statusCode, json });
      });
      res.on('error', () => resolveP(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolveP(null));
    if (data) req.write(data);
    req.end();
  });
}

/**
 * The live check (S7). No other process's command line is read and no helper
 * runs. A supervisor is live only when run.json's pid is alive and its /health,
 * asked with the token, returns { run, pid, serverPid } equal to run.json's.
 * Returns { run, health } or null.
 */
export async function liveSupervisor(dir) {
  const run = readJsonFile(runPaths(dir).run);
  if (!run || !pidAlive(run.pid) || !Number.isInteger(run.port) || typeof run.token !== 'string') return null;
  const r = await httpJson({ port: run.port, path: '/health', token: run.token, timeoutMs: 2000 });
  if (!r || r.status !== 200 || !isObj(r.json)) return null;
  const h = r.json;
  return h.run === run.run && h.pid === run.pid && h.serverPid === run.serverPid ? { run, health: h } : null;
}

/**
 * run.lock: created exclusive. A lock whose pid is gone is stale; it is taken
 * over under a second exclusive step (the folder run.lock.take), which re-reads
 * the lock first, so two callers that both saw it stale cannot both win.
 */
export function takeLock(dir, pid = process.pid) {
  const p = runPaths(dir).lock;
  const create = () => {
    try {
      writeFileSync(p, `${pid}\n`, { flag: 'wx', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  };
  const holder = () => Number.parseInt(String(readFileSyncSafe(p)).trim(), 10);
  if (create()) return true;
  if (!existsSync(p)) return create();
  const held = holder();
  if (pidAlive(held)) return false;
  if (Number.isNaN(held)) {
    // A lock being written has no pid yet; only an old one with none is stale.
    try {
      if (Date.now() - statSync(p).mtimeMs < 2000) return false;
    } catch {
      return create();
    }
  }
  const mutex = `${p}.take`;
  try {
    mkdirSync(mutex, { mode: 0o700 });
  } catch {
    // another caller is taking it over; one left by a dead caller is cleared for the next try
    try {
      if (Date.now() - statSync(mutex).mtimeMs > 10_000) rmdirSync(mutex);
    } catch {
      // gone
    }
    return false;
  }
  try {
    if (pidAlive(holder())) return false;
    rmSync(p, { force: true });
    return create();
  } finally {
    try {
      rmdirSync(mutex);
    } catch {
      // gone
    }
  }
}

function readFileSyncSafe(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function releaseLock(dir, pid = process.pid) {
  const p = runPaths(dir).lock;
  if (Number.parseInt(readFileSyncSafe(p).trim(), 10) === pid) rmSync(p, { force: true });
}

/**
 * Ends every orphan server on Linux: a process whose /proc/<pid>/exe lies under
 * <clef folder>/runtime/ (any tag, or a deleted target there) and whose parent is
 * not the live supervisor. Called only while holding run.lock. Returns the pids
 * it ended.
 */
export function sweepOrphans({ dir, procRoot = '/proc', kill = pid => process.kill(pid, 'SIGKILL'), liveSupervisorPid = null }) {
  const ended = [];
  const base = `${posix.resolve(dir.split('\\').join('/'))}/runtime/`;
  let names;
  try {
    names = readdirSync(procRoot);
  } catch {
    return ended;
  }
  for (const n of names) {
    if (!/^[0-9]+$/.test(n)) continue;
    const pid = Number(n);
    if (pid === process.pid) continue;
    let exe;
    try {
      exe = readlinkSync(join(procRoot, n, 'exe'));
    } catch {
      continue;
    }
    exe = exe.replace(/ \(deleted\)$/, '');
    if (!exe.startsWith(base)) continue;
    let ppid = null;
    try {
      const stat = readFileSync(join(procRoot, n, 'stat'), 'utf8');
      ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    } catch {
      continue;
    }
    if (liveSupervisorPid !== null && ppid === liveSupervisorPid) continue;
    try {
      kill(pid);
      ended.push(pid);
    } catch {
      // already gone
    }
  }
  return ended;
}

/** Why the tool is not set up for the table, or null: a word and the setup. */
function notSetUp(dir, platform, server = SERVER, model = MODEL) {
  const setup = readSetup(dir);
  if (!setup) return { reason: 'missing' };
  const a = server.archives[setup.platform];
  if (setup.tag !== server.tag || setup.model !== model.sha256 || !a) return { reason: 'pin-changed' };
  const p = paths(dir, server, model);
  if (!existsSync(join(p.runtime, destName(a.exe, a.exe))) || !existsSync(p.model)) return { reason: 'missing' };
  return { setup, archive: a, paths: p };
}

/** A copy of what a file is now: size, mtime and sha256, or null when it is gone. */
function fingerprint(path) {
  try {
    const s = statSync(path);
    return { size: s.size, mtimeMs: s.mtimeMs, sha256: sha256Of(readFileSync(path)) };
  } catch {
    return null;
  }
}
const sameFingerprint = (a, b) => a !== null && b !== null && a.size === b.size && a.mtimeMs === b.mtimeMs && a.sha256 === b.sha256;

/**
 * The body the supervisor returns, built from checked values only: for each
 * asked question id, a finite number in [0,1] (noul, score), or a choice that is
 * one of the criteria keys sent, with a probability in [0,1] for each sent key
 * and no other key. Anything else is null, and the caller answers no-answer.
 */
export function checkedAnswer(questions, raw) {
  if (!isObj(questions) || !isObj(raw)) return null;
  const ids = Object.keys(questions);
  if (ids.length === 0 || ids.length > MAX_QUESTIONS || Object.keys(raw).length !== ids.length) return null;
  const out = [];
  for (const id of ids) {
    const q = questions[id];
    if (!isObj(q) || !Object.hasOwn(raw, id) || !isObj(raw[id])) return null;
    // b12211 adds `type` (the question's own) and `confidence` (a number from 0 to 1) to each answer; both are checked, then dropped. Any other key refuses.
    const { type, confidence, ...a } = raw[id];
    if ((type !== undefined && type !== q.type) || (confidence !== undefined && !unit(confidence))) return null;
    const keys = Object.keys(a);
    if (q.type === 'noul' || q.type === 'score') {
      if (keys.length !== 1 || keys[0] !== q.type || !unit(a[q.type])) return null;
      out.push([id, { [q.type]: a[q.type] }]);
    } else if (q.type === 'choice') {
      if (!isObj(q.criteria)) return null;
      const options = Object.keys(q.criteria);
      if (keys.length !== 2 || !Object.hasOwn(a, 'choice') || !Object.hasOwn(a, 'probabilities')) return null;
      if (typeof a.choice !== 'string' || !options.includes(a.choice) || !isObj(a.probabilities)) return null;
      const given = Object.keys(a.probabilities);
      if (given.length !== options.length || !options.every(k => Object.hasOwn(a.probabilities, k) && unit(a.probabilities[k]))) return null;
      out.push([id, { choice: a.choice, probabilities: Object.fromEntries(options.map(k => [k, a.probabilities[k]])) }]);
    } else return null;
  }
  return Object.fromEntries(out);
}

/**
 * The checked body for a server's whole reply. b12211 answers
 * `{ model, answers: { <id>: { type, ... } }, usage }`; only `answers` is read,
 * `model` (a path) and `usage` are never looked at or passed on, and a reply
 * with no `answers` object, such as the bare answers, is null.
 */
export function serverAnswer(questions, reply) {
  if (!isObj(reply) || !Object.hasOwn(reply, 'answers')) return null;
  return checkedAnswer(questions, reply.answers);
}

/** The questions a caller sent, or null when the body is not { state, questions } with a usable question set. */
function checkedRequest(body) {
  if (!isObj(body) || !isObj(body.questions)) return null;
  const ids = Object.keys(body.questions);
  if (ids.length === 0 || ids.length > MAX_QUESTIONS) return null;
  for (const id of ids) {
    const q = body.questions[id];
    if (!isObj(q) || !['noul', 'score', 'choice'].includes(q.type) || (q.type === 'choice' && !isObj(q.criteria))) return null;
  }
  return body;
}

const tokenEqual = (given, wanted) => timingSafeEqual(createHash('sha256').update(String(given)).digest(), createHash('sha256').update(wanted).digest());

function freePort() {
  return new Promise((resolveP, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolveP(port));
    });
  });
}

/**
 * The supervisor: `clef serve`, started detached by `ensure`. It binds
 * 127.0.0.1 on a port the OS picks, starts the server on another loopback port
 * with the key in a file, answers only GET /health and POST /v1/systemone to a
 * caller with the token, and returns only a body it built from checked values.
 * It ends the server and itself after `idleMs` with no forwarded request, when
 * its own script changes or goes, on a signal, and when the server exits.
 * Resolves { done, stop } once it is serving; `done` resolves with the reason.
 * Test seams are parameters here only: exe and exePrefix (the server program),
 * pdeathsig, the timings, and scriptUrl.
 */
export async function serve({ dir, platform = process.platform, env = process.env, server = SERVER, model = MODEL, exe, exePrefix = [], pdeathsig = true, idleMs = IDLE_MS, checkMs = CHECK_MS, startTimeoutMs = START_TIMEOUT_MS, pollMs = 250, scriptUrl = import.meta.url, now = Date.now }) {
  const ready = notSetUp(dir, platform, server, model);
  if (!ready.setup) {
    writeFail(dir, 'exit', now);
    throw new Refused('clef-setup', `not set up (${ready.reason})`);
  }
  const rp = runPaths(dir);
  const p = ready.paths;
  const scriptPath = fileURLToPath(scriptUrl);
  const own = fingerprint(scriptPath);
  const token = randomBytes(32).toString('hex');
  const serverKey = randomBytes(32).toString('hex');
  const runId = randomBytes(16).toString('hex');
  rmSync(rp.run, { force: true });
  const serverPort = await freePort();
  writeFileSync(rp.key, `${serverKey}\n`, { mode: 0o600 });
  const exePath = exe ?? join(p.runtime, destName(ready.archive.exe, ready.archive.exe));
  const cmd = launchCommand({ platform, exe: exePath, exePrefix, args: serverArgs({ port: serverPort, keyFile: rp.key, modelPath: p.model, vulkan: ready.setup.backend === 'vulkan', metal: ready.setup.backend === 'metal', noDevice: ready.setup.platform === 'darwin-arm64-cpu' }), pdeathsig });
  let stopping = false;
  let isReady = false;
  let lastForward = now();
  let child;
  let httpServer;
  let resolveDone;
  let onSignal;
  let onExit;
  const done = new Promise(r => (resolveDone = r));
  const timers = [];
  let lines = 0;
  const childExited = new Promise(r => {
    try {
      child = spawn(cmd.file, cmd.args, { cwd: p.runtime, env: serveEnv(env, platform, p.runtime), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    } catch {
      child = null;
      r();
      return;
    }
    child.on('error', () => r());
    child.on('exit', () => r());
    for (const s of [child.stdout, child.stderr]) s.on('data', buf => { for (const b of buf) if (b === 10) lines++; });
  });
  const cleanFiles = () => {
    const cur = readJsonFile(rp.run);
    if (!cur || cur.run === runId) rmSync(rp.run, { force: true });
    // run.key is this run's only when it still holds this run's key; a newer run's is left alone.
    if (readFileSyncSafe(rp.key).trim() === serverKey) rmSync(rp.key, { force: true });
  };
  const stop = async reason => {
    if (stopping) return done;
    stopping = true;
    for (const t of timers) clearInterval(t);
    if (onSignal) {
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
      process.off('exit', onExit);
    }
    try {
      httpServer?.closeAllConnections?.();
      httpServer?.close();
    } catch {
      // already closed
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      let giveUp;
      await Promise.race([childExited, new Promise(r => (giveUp = setTimeout(r, 5000)))]);
      clearTimeout(giveUp);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    cleanFiles();
    logLine(dir, `stopped ${reason} lines ${lines}`);
    releaseLock(dir);
    resolveDone(reason);
    return done;
  };
  if (!child) {
    writeFail(dir, 'exit', now);
    cleanFiles();
    throw new Refused('clef-setup', 'the server could not be started');
  }
  childExited.then(() => {
    if (!stopping) {
      writeFail(dir, 'exit', now);
      stop('exit');
    }
  });
  const reply = (res, status, word, close = false) => {
    const body = JSON.stringify({ error: word });
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...(close ? { connection: 'close' } : {}) });
    res.end(body);
    if (close) {
      // The rest of an unread body is read and dropped for a moment, so the caller sees the refusal and not a reset.
      res.req.resume();
      setTimeout(() => res.req.destroy(), 2000).unref();
    }
  };
  const scriptChanged = () => !sameFingerprint(own, fingerprint(scriptPath));
  httpServer = createHttpServer((req, res) => {
    const port = httpServer.address().port;
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(res, 400, 'host', true);
    if (req.headers.origin !== undefined) return reply(res, 403, 'origin', true);
    const auth = req.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ') || !tokenEqual(auth.slice(7), token)) return reply(res, 401, 'auth', true);
    if (req.method === 'GET' && req.url === '/health') {
      const body = JSON.stringify({ run: runId, pid: process.pid, serverPid: child.pid, ready: isReady });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
      return res.end(body);
    }
    if (req.url !== '/v1/systemone') return reply(res, 404, 'route', true);
    if (req.method !== 'POST') return reply(res, 405, 'method', true);
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return reply(res, 415, 'content-type', true);
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return reply(res, 413, 'too-large', true);
    const chunks = [];
    let n = 0;
    let refused = false;
    req.on('data', c => {
      n += c.length;
      if (n > MAX_BODY && !refused) {
        refused = true;
        reply(res, 413, 'too-large', true);
      } else if (!refused) chunks.push(c);
    });
    req.on('error', () => {});
    req.on('end', async () => {
      if (refused) return;
      let parsed = null;
      try {
        parsed = checkedRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        // not JSON
      }
      if (!parsed) return reply(res, 400, 'body');
      if (scriptChanged()) {
        reply(res, 503, 'stopping');
        stop('changed');
        return;
      }
      if (!isReady) return reply(res, 503, 'not-ready');
      lastForward = now();
      const t0 = Date.now();
      const r = await httpJson({ port: serverPort, path: '/v1/systemone', method: 'POST', token: serverKey, body: { state: parsed.state, questions: parsed.questions }, timeoutMs: FORWARD_TIMEOUT_MS });
      const answer = r && r.status === 200 ? serverAnswer(parsed.questions, r.json) : null;
      logLine(dir, `forward ${answer ? 'answer' : 'no-answer'} ms ${Date.now() - t0}`);
      if (!answer) return reply(res, 502, 'no-answer');
      const body = JSON.stringify(answer);
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
      res.end(body);
    });
  });
  httpServer.on('clientError', (e, socket) => socket.destroy());
  try {
    await new Promise((resolveP, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolveP);
    });
    const port = httpServer.address().port;
    writeFileSync(rp.run, `${JSON.stringify({ port, token, run: runId, pid: process.pid, serverPid: child.pid, started: new Date(now()).toISOString() })}\n`, { mode: 0o600 });
  } catch (e) {
    // The server is already running: end it before the failure goes up, or nothing would.
    writeFail(dir, 'exit', now);
    await stop('exit');
    throw e;
  }
  releaseLock(dir);
  logLine(dir, `serving ready no`);
  const startedAt = now();
  timers.push(setInterval(async () => {
    if (isReady || stopping) return;
    const r = await httpJson({ port: serverPort, path: '/health', token: serverKey, timeoutMs: 1000 });
    if (r && r.status === 200 && !isReady) {
      isReady = true;
      logLine(dir, `server ready ms ${now() - startedAt}`);
    } else if (!isReady && now() - startedAt > startTimeoutMs && !stopping) {
      writeFail(dir, 'timeout', now);
      stop('timeout');
    }
  }, pollMs));
  timers.push(setInterval(() => {
    if (stopping) return;
    if (now() - lastForward > idleMs) stop('idle');
    else if (scriptChanged()) stop('changed');
  }, checkMs));
  onSignal = () => stop('signal');
  onExit = () => {
    try {
      child?.kill();
    } catch {
      // gone
    }
    cleanFiles();
  };
  if (!stopping) {
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
    process.once('exit', onExit);
  }
  return { done, stop };
}

/** The ready check for `ensure`: the state a live supervisor is in, with its URL. */
function stateOf(live) {
  return { url: `http://127.0.0.1:${live.run.port}`, state: live.health.ready ? 'ready' : 'starting' };
}

/**
 * `clef ensure` (S7): one result, { out, code }. It never fetches and never
 * prints a token: the caller reads the token from run.json. States: ready,
 * starting, not-set-up (exit 3), failed (exit 4).
 */
export async function ensure({ dir, wait = 0, platform = process.platform, env = process.env, execPath = process.execPath, scriptPath = fileURLToPath(import.meta.url), supervisorCommand, server = SERVER, model = MODEL, now = Date.now, procRoot, kill }) {
  const rp = runPaths(dir);
  const secs = Math.min(60, Math.max(0, Number.isFinite(wait) ? wait : 0));
  const deadline = Date.now() + secs * 1000;
  const setup = notSetUp(dir, platform, server, model);
  if (!setup.setup) return { out: { state: 'not-set-up', reason: setup.reason }, code: 3 };
  const failed = () => {
    const f = readJsonFile(rp.fail);
    return f && typeof f.time === 'number' && now() - f.time < FAIL_BACKOFF_MS ? { state: 'failed', reason: ['exit', 'timeout'].includes(f.reason) ? f.reason : 'exit' } : null;
  };
  const lastFail = failed();
  if (lastFail) return { out: lastFail, code: 4 };
  let live = await liveSupervisor(dir);
  const waitFor = async () => {
    for (;;) {
      live = await liveSupervisor(dir);
      if (live && (live.health.ready || secs === 0 || Date.now() >= deadline)) return { out: stateOf(live), code: 0 };
      const f = failed();
      if (f) return { out: f, code: 4 };
      if (Date.now() >= deadline) return live ? { out: stateOf(live), code: 0 } : { out: { state: 'starting' }, code: 0 };
      await sleep(100);
    }
  };
  if (live) return live.health.ready || secs === 0 ? { out: stateOf(live), code: 0 } : waitFor();
  const wasLocked = !takeLock(dir);
  if (!wasLocked) rmSync(rp.run, { force: true });
  if (wasLocked) return waitFor();
  try {
    if (platform === 'linux') sweepOrphans({ dir, procRoot, kill });
    const cmd = supervisorCommand ? supervisorCommand() : { file: execPath, args: [scriptPath, 'serve'] };
    const child = spawn(cmd.file, cmd.args, { cwd: setup.paths.runtime, env: supervisorEnv(env, platform, setup.paths.runtime), detached: true, stdio: 'ignore', windowsHide: true, shell: false });
    child.on('error', () => {});
    child.unref();
    // The supervisor holds the lock until it has written run.json.
    writeFileSync(rp.lock, `${child.pid}\n`, { mode: 0o600 });
  } catch {
    releaseLock(dir);
    writeFail(dir, 'exit', now);
    return { out: { state: 'failed', reason: 'exit' }, code: 4 };
  }
  if (secs === 0) return { out: { state: 'starting' }, code: 0 };
  return waitFor();
}

/**
 * `clef stop` (S7): ends only the supervisor its /health just reported, then
 * clears run.json, run.key and run.fail. With none live it ends nothing.
 * Returns { lines, code }.
 */
export async function stopRun({ dir, platform = process.platform, procRoot, kill, waitMs = 10_000 }) {
  const rp = runPaths(dir);
  const live = await liveSupervisor(dir);
  const locked = takeLock(dir);
  try {
    if (live) {
      try {
        process.kill(live.run.pid);
      } catch {
        // gone already
      }
      const until = Date.now() + waitMs;
      while (pidAlive(live.run.pid) && Date.now() < until) await sleep(50);
    }
    if (locked && platform === 'linux') sweepOrphans({ dir, procRoot, kill, liveSupervisorPid: null });
  } finally {
    if (locked) releaseLock(dir);
  }
  rmSync(rp.run, { force: true });
  rmSync(rp.key, { force: true });
  rmSync(rp.fail, { force: true });
  return { lines: [live ? 'stopped' : 'none running'], code: 0 };
}

/** `clef status` (S7): setup's platform, tag, backend and model prefix, the run state, and the last failure word. Never a token, key or path outside the clef folder. */
export async function statusRun({ dir, platform = process.platform, server = SERVER, model = MODEL, now = Date.now }) {
  const setup = readSetup(dir);
  const lines = [];
  if (!setup) lines.push('setup: none');
  else lines.push(`platform: ${quote(setup.platform)}`, `tag: ${quote(setup.tag)}`, `backend: ${quote(setup.backend)}`, `model: ${quote(String(setup.model).slice(0, 8))}`);
  const live = await liveSupervisor(dir);
  lines.push(`run: ${live ? (live.health.ready ? 'ready' : 'starting') : 'stopped'}`);
  const f = readJsonFile(runPaths(dir).fail);
  lines.push(`last failure: ${f && ['exit', 'timeout'].includes(f.reason) ? f.reason : 'none'}`);
  return { lines, code: 0 };
}

/** The size of a folder in bytes, following no link. */
function folderBytes(path) {
  let total = 0;
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(path, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) total += folderBytes(p);
    else {
      try {
        total += lstatSync(p).size;
      } catch {
        // gone while counting
      }
    }
  }
  return total;
}

/**
 * `clef remove` (S7): prints the clef folder and its size. With `yes` it stops a
 * live supervisor, then deletes the clef folder, following no link out of it.
 */
export async function removeRun({ dir, yes = false, platform = process.platform, procRoot, kill }) {
  const lines = [`clef folder: ${quote(dir)}`, `size: ${mb(folderBytes(dir))}`];
  if (!yes) return { lines: [...lines, 'run again with --yes to delete it'], code: 0 };
  await stopRun({ dir, platform, procRoot, kill });
  // A server that has just been ended can hold its folder for a moment on Windows.
  rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  lines.push('removed');
  return { lines, code: 0 };
}

// ---------------------------------------------------------------- the command

const quote = s => JSON.stringify(String(s)).slice(1, -1);

const MODES = Object.freeze({ setup: ['--cpu', '--yes'], verify: [], ensure: [], serve: [], stop: [], status: [], remove: ['--yes'] });

/** Runs one mode. `io` is { out(line), }; returns the exit code. */
export async function main(argv, { env = process.env, platform = process.platform, arch = process.arch, execPath = process.execPath, cwd = process.cwd(), out = l => process.stdout.write(`${l}\n`), transport = makeTransport(), exists = existsSync, free, chdir = process.chdir.bind(process), account = accountHome(), serveOptions = {} } = {}) {
  const refuse = (word, why) => {
    out(`REFUSED ${word}: ${why}`);
    out(`RESULT: refused ${word}`);
    return 2;
  };
  const [mode, ...rest] = argv;
  const known = Object.hasOwn(MODES, mode) ? MODES[mode] : null;
  if (!known) return refuse('usage', 'the modes are setup, verify, ensure, stop, status and remove');
  let wait = 0;
  let flagArgs = rest;
  if (mode === 'ensure') {
    const i = rest.indexOf('--wait');
    if (i !== -1) {
      const v = rest[i + 1];
      if (!/^[0-9]{1,2}$/.test(v ?? '') || Number(v) > 60) return refuse('usage', 'ensure --wait takes whole seconds, at most 60');
      wait = Number(v);
      flagArgs = [...rest.slice(0, i), ...rest.slice(i + 2)];
    }
  }
  const flags = new Set(flagArgs);
  if (flagArgs.length !== flags.size || flagArgs.some(f => !known.includes(f))) return refuse('usage', `${mode} takes ${known.length ? known.join(' and ') : mode === 'ensure' ? '--wait <seconds>' : 'no flags'}`);
  let dir;
  try {
    dir = clefDir(claudeHome(env, account ?? homedir()));
  } catch (e) {
    return refuse(e.code ?? 'usage', quote(e.message));
  }
  // The default folder under the account's home is not outside input; a value from the environment is, and so is a home taken from HOME or USERPROFILE when the account record cannot be read. Those are checked against the starting folder, before anything is made.
  const fromEnv = Boolean(env.CLAUDE_CONFIG_DIR) || account === null;
  if (mode === 'serve') {
    // `ensure` starts the supervisor from runtime/<tag>/ of the clef folder it checked, and passes it CLAUDE_CONFIG_DIR. `serve` works the folder out as every mode does and runs only from that one's runtime/<tag>/: a folder of the right shape that is not the account's is refused.
    let same = false;
    try {
      const norm = p => (platform === 'win32' ? realOf(p).toLowerCase() : realOf(p));
      same = norm(join(dir, 'runtime', SERVER.tag)) === norm(cwd);
    } catch {
      same = false;
    }
    if (!same) {
      if (existsSync(dir)) writeFail(dir, 'exit');
      return refuse('clef-home', 'serve runs only from runtime/<tag>/ of the clef folder');
    }
  } else {
    try {
      if (fromEnv) assertOutsideStart(dir, cwd);
    } catch (e) {
      return e instanceof Refused ? refuse(e.code, quote(e.message)) : refuse('usage', 'the clef folder cannot be checked');
    }
    // Every other mode starts from the clef folder, and none starts a program by a bare name (S6).
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      return refuse('usage', 'the clef folder cannot be made');
    }
  }
  try {
    assertRealFolders(dir, cwd, { checkStart: fromEnv && mode !== 'serve' });
    if (mode !== 'serve') chdir(mode === 'remove' ? dirname(dir) : dir);
  } catch (e) {
    return e instanceof Refused ? refuse(e.code, quote(e.message)) : refuse('usage', 'the clef folder cannot be entered');
  }
  try {
    if (mode === 'verify') {
      const r = verify({ dir });
      for (const l of r.lines) out(l);
      out(r.failed.length ? `RESULT: fail ${r.failed.length}` : 'RESULT: pass');
      return r.failed.length ? 1 : 0;
    }
    if (mode === 'ensure') {
      const r = await ensure({ dir, wait, platform, env, execPath });
      out(JSON.stringify(r.out));
      return r.code;
    }
    if (mode === 'serve') {
      const h = await serve({ dir, platform, env, ...serveOptions });
      const reason = await h.done;
      return ['exit', 'timeout'].includes(reason) ? 1 : 0;
    }
    if (mode === 'stop' || mode === 'status' || mode === 'remove') {
      const r = mode === 'stop' ? await stopRun({ dir, platform }) : mode === 'status' ? await statusRun({ dir, platform }) : await removeRun({ dir, yes: flags.has('--yes'), platform });
      for (const l of r.lines) out(l);
      out('RESULT: pass');
      return r.code;
    }
    if (platform === 'linux' && !exists(SETPRIV)) return refuse('clef-setpriv', 'this machine has no /usr/bin/setpriv, which keeps the server from outliving the supervisor');
    if (await liveSupervisor(dir)) return refuse('clef-running', 'a supervisor is running; run `clef stop` first');
    const yes = flags.has('--yes');
    const locked = yes ? takeLock(dir) : true;
    if (!locked) return refuse('clef-running', 'a supervisor is starting; run `clef stop` first');
    try {
      if (yes && platform === 'linux') sweepOrphans({ dir });
      const r = await runSetup({ dir, yes, cpu: flags.has('--cpu'), platform, arch, execPath, cwd, transport, exists, free });
      for (const l of r.lines) out(l);
      out('RESULT: pass');
      return 0;
    } finally {
      if (yes) releaseLock(dir);
    }
  } catch (e) {
    if (e instanceof Refused) return refuse(e.code, quote(e.message));
    return refuse('clef-fetch', `the fetch did not finish (${quote(e.message)}); run setup again`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
