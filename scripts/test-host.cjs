'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process');
function validateProfile(profile,platform=process.platform){
 // VS Code creates a Unix socket beneath user-data-dir; sockaddr_un is short.
 if(platform!=='win32'&&Buffer.byteLength(path.join(profile,'1.99-main.sock'))>100)throw Error('VS Code IPC 路径过长，会触发 listen EINVAL；请将独立 user-data-dir 放到 /tmp 等短路径。');
}
function run(){
 require('./check-runtime.cjs').check();
 const profile=fs.mkdtempSync(path.join(process.platform==='win32'?os.tmpdir():'/tmp','dash-host-'));
 validateProfile(profile);
 const root=path.resolve(__dirname,'..'),output=path.resolve(process.env.DASHBOARD_TEST_OUTPUT||path.join(root,'review','host-result.json'));
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.rmSync(output,{force:true});
 if(process.platform==='win32'&&!process.env.VSCODE_PATH)throw Error('Windows 真实宿主测试请将 VSCODE_PATH 指向 Code.exe。');
 const executable=process.env.VSCODE_PATH||(process.platform==='darwin'?'/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code':process.platform==='win32'?'code.cmd':'code');
 const args=['--user-data-dir',profile,'--extensions-dir',path.join(profile,'extensions'),'--extensionDevelopmentPath='+root,'--extensionTestsPath='+path.join(root,'test','integration.cjs'),'--disable-extensions','--skip-welcome','--skip-release-notes','--disable-workspace-trust','--disable-updates','--new-window','--wait'];
 console.log('Isolated VS Code profile: '+profile);
 // Keep the profile as diagnostic evidence. Never touch the normal user profile.
 const result=spawnSync(executable,args,{stdio:'inherit',timeout:120000,env:{...process.env,DASHBOARD_TEST_USER_DATA_DIR:profile,DASHBOARD_TEST_OUTPUT:output}});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error('VS Code integration failed: '+result.status);
 const report=JSON.parse(fs.readFileSync(output,'utf8'));
 if(!report.passed)throw Error(report.error||'VS Code integration failed');
 console.log(JSON.stringify(report,null,2));
}
if(require.main===module){try{run();}catch(error){console.error(error);process.exitCode=1;}}
module.exports={validateProfile};
