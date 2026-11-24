'use strict';
const fs=require('node:fs');
function browserOptions(chromium,env=process.env,exists=fs.existsSync){
 const executablePath=env.CHROMIUM_PATH||chromium.executablePath();
 // A standard Chromium installation can use its headless mode. Do not rely
 // on the separately downloaded headless-shell executable being present.
 if(!exists(executablePath))throw Error('缺少 Playwright Chromium。请运行 npx playwright install chromium，或通过 CHROMIUM_PATH 指定已安装的 Chrome 可执行文件。');
 return {headless:true,executablePath,args:['--no-sandbox']};
}
async function launchBrowser(chromium,env=process.env,exists=fs.existsSync){
 const options=browserOptions(chromium,env,exists);
 try{return await chromium.launch(options);}
 catch(error){
  if(/EPERM|Operation not permitted|SIGABRT/.test(error.message))throw new Error('浏览器启动被系统或沙箱阻止；请在允许启动浏览器的测试环境重试。此结果不代表 UI 测试通过。',{cause:error});
  throw error;
 }
}
module.exports={browserOptions,launchBrowser};
