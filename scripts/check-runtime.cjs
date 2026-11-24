'use strict';
// jsdom 31 / undici require a recent Node with zstd support.
function supported(version) {
 const [major,minor,patch]=version.split('.').map(Number);
 return major===22&&(minor>22||minor===22&&patch>=2)||major===24&&minor>=15||major>=26;
}
function check(version=process.versions.node,zstd=require('node:zlib').createZstdDecompress){
 if(!supported(version)||typeof zstd!=='function')throw Error(`测试及打包需要 Node 22.22.2+ (22.x)、24.15+ (24.x) 或 26+；当前 ${version}。旧版缺少 jsdom/undici 所需的 zstd API。`);
}
if(require.main===module){try{check();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={supported,check};
