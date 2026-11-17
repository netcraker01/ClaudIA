import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const cli=path.join(root,'claudia')
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'claudia-test-'))
function archivePackage(dir, archive, tag){const root=path.join(dir,'claudia');for(const f of ['install-claudia-all.mjs','install-claudia-light.mjs','repair-claudia-engram.mjs'])if(!fs.existsSync(path.join(root,f)))fs.copyFileSync(path.join(rootDir,f),path.join(root,f));for(const d of ['claudia-model-manager-v2','profiles','skills'])if(!fs.existsSync(path.join(root,d)))fs.cpSync(path.join(rootDir,d),path.join(root,d),{recursive:true});const files=[];const walk=(base,prefix='')=>{for(const name of fs.readdirSync(base)){const p=path.join(base,name),rel=path.posix.join(prefix,name);if(fs.lstatSync(p).isDirectory())walk(p,rel);else files.push({path:rel,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')})}};walk(root);fs.writeFileSync(path.join(root,'package-manifest.json'),JSON.stringify({version:tag,files},null,2)+'\n');return spawnSync('tar',['-czf',archive,'-C',dir,'claudia'])}
function removeInstalledVersionHelper(dir){fs.rmSync(path.join(dir,'claudia-model-manager-v2','installed-version.mjs'),{force:true})}
function installLegacyPackage(s,tag='v0.1.4'){const archive=path.join(s.home,`claudia-${tag}.tar.gz`),dir=path.join(s.home,'legacy','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),'process.exit(0)');removeInstalledVersionHelper(dir);assert.equal(archivePackage(path.dirname(dir),archive,tag).status,0);const r=run(s.home,['install',`--version=${tag}`],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:archive});assert.equal(r.status,0,r.stderr);return {archive,dir}}
const rootDir=root
function setup(t, installer='process.exit(0)') {
  const home=tmp(); t.after(()=>fs.rmSync(home,{recursive:true,force:true}))
  const op=path.join(home,'.config/opencode');fs.mkdirSync(op,{recursive:true});fs.writeFileSync(path.join(op,'opencode.json'),'{"custom":true}\n')
  const mock=path.join(home,'mock');fs.mkdirSync(mock)
  const gh=path.join(mock,'gh');fs.writeFileSync(gh,`#!/bin/sh\nprintf '%s\\n' "$*" >> "$GH_LOG"\ncase "$1" in --version|auth) exit 0;; release) echo v1.2.3;; attestation) [ "$REJECT_ATTESTATION" != 1 ];; *) exit 0;; esac\n`);fs.chmodSync(gh,0o755)
  const source=path.join(home,'src','claudia');fs.mkdirSync(source,{recursive:true});fs.copyFileSync(cli,path.join(source,'claudia'))
  fs.writeFileSync(path.join(source,'install-claudia-orchestration.mjs'),installer)
  const archive=path.join(home,'claudia-v1.2.3.tar.gz');fs.mkdirSync(path.dirname(archive),{recursive:true})
  const tar=archivePackage(path.dirname(source),archive,'v1.2.3');assert.equal(tar.status,0)
  const env={...process.env,HOME:home,NODE_ENV:'test',PATH:`${mock}:${process.env.PATH}`,GH_LOG:path.join(home,'gh.log'),CLAUDIA_VERIFIED_ARCHIVE:archive}
  return {home,op,archive,env}
}
function run(home,args,env,cliPath=cli){return spawnSync(process.execPath,[cliPath,...args],{encoding:'utf8',env:{...env,HOME:home}})}

test('status is safe and accurately reports absent install',t=>{const s=setup(t);const r=run(s.home,['status'],s.env);assert.equal(r.status,0);assert.match(r.stdout,/not installed/)})
test('verified artifact install uses exact signer workflow and writes manifest',t=>{const s=setup(t);const r=run(s.home,['install','--version=v1.2.3'],s.env);assert.equal(r.status,0,r.stderr);assert.ok(fs.existsSync(path.join(s.home,'.local/share/claudia/manifest.json')));assert.equal(fs.readlinkSync(path.join(s.home,'.local/share/claudia/active')),'versions/v1.2.3');const calls=fs.readFileSync(s.env.GH_LOG,'utf8').trim().split('\n');const attestation=calls.find(line=>line.startsWith('attestation verify '));assert.ok(attestation);assert.match(attestation,/--repo netcraker01\/ClaudIA/);assert.match(attestation,/--signer-workflow netcraker01\/ClaudIA\/\.github\/workflows\/release\.yml/);assert.doesNotMatch(attestation,/--signer-repo/)})
test('attestation command failure prevents activation',t=>{const s=setup(t);const r=run(s.home,['install','--version=v1.2.3'],{...s.env,REJECT_ATTESTATION:'1'});assert.notEqual(r.status,0);assert.match(r.stderr,/gh failed \(1\)/);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia')),false)})
test('archive filename must bind exactly to the requested tag',t=>{const s=setup(t);const wrong=path.join(s.home,'other.tar.gz');fs.copyFileSync(s.archive,wrong);const r=run(s.home,['install','--version=v1.2.3'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:wrong});assert.notEqual(r.status,0);assert.match(r.stderr,/filename must be/);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/active')),false)})
test('symlink archive input is rejected',t=>{const s=setup(t);const real=path.join(s.home,'archive-real.tar.gz');fs.renameSync(s.archive,real);fs.symlinkSync(real,s.archive);const r=run(s.home,['install','--version=v1.2.3'],s.env);assert.notEqual(r.status,0);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/active')),false)});
test('package manifest content mismatch prevents installation',t=>{const s=setup(t);const d=path.join(s.home,'badpkg','claudia');fs.mkdirSync(d,{recursive:true});fs.copyFileSync(cli,path.join(d,'claudia'));fs.writeFileSync(path.join(d,'install-claudia-orchestration.mjs'),'process.exit(0)');fs.writeFileSync(path.join(d,'package-manifest.json'),JSON.stringify({version:'v1.2.3',files:[]}));const archive=path.join(s.home,'claudia-v1.2.3.tar.gz');spawnSync('tar',['-czf',archive,'-C',path.dirname(d),'claudia']);const r=run(s.home,['install','--version=v1.2.3'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:archive});assert.notEqual(r.status,0);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/active')),false)});
test('structured archive inspection rejects newline, traversal and symlink entries',t=>{for(const [kind,name] of [['regular','claudia/bad\nname'],['regular','claudia/../escape'],['symlink','claudia/link']]){const s=setup(t);const archive=path.join(s.home,'claudia-v1.2.3.tar.gz');const script=`import io,sys,tarfile\nwith tarfile.open(sys.argv[1],'w:gz') as t:\n d=tarfile.TarInfo('claudia/');d.type=tarfile.DIRTYPE;t.addfile(d)\n x=tarfile.TarInfo(sys.argv[2]);x.type=tarfile.SYMTYPE if sys.argv[3]=='symlink' else tarfile.REGTYPE;x.linkname='/tmp/unsafe' if x.issym() else '';data=b'x';x.size=0 if x.issym() else len(data);t.addfile(x,io.BytesIO(data) if not x.issym() else None)`;assert.equal(spawnSync('python3',['-c',script,archive,name,kind]).status,0);const r=run(s.home,['install','--version=v1.2.3'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:archive});assert.notEqual(r.status,0,`${kind} ${JSON.stringify(name)} accepted`);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/active')),false)}});
test('invalid version is rejected',t=>{const s=setup(t);const r=run(s.home,['install','--version=latest'],s.env);assert.notEqual(r.status,0);assert.match(r.stderr,/Use --latest/)})
test('successful update atomically switches active and uninstall removes all owned versions',t=>{const s=setup(t);assert.equal(run(s.home,['install','--version=v1.2.3'],s.env).status,0);const next=path.join(s.home,'claudia-v1.2.4.tar.gz');const dir=path.join(s.home,'next','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),'process.exit(0)');assert.equal(archivePackage(path.dirname(dir),next,'v1.2.4').status,0);const r=run(s.home,['update','--version=v1.2.4'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:next});assert.equal(r.status,0,r.stderr);assert.equal(fs.readlinkSync(path.join(s.home,'.local/share/claudia/active')),'versions/v1.2.4');assert.ok(fs.existsSync(path.join(s.home,'.local/share/claudia/versions/v1.2.3/claudia')));const remove=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.equal(remove.status,0,remove.stderr);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/versions/v1.2.3')),false);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/versions/v1.2.4')),false)});
test('update accepts a valid v0.1.4 ownership record without the later installed-version helper',t=>{const s=setup(t);installLegacyPackage(s);const next=path.join(s.home,'claudia-v0.1.6.tar.gz'),dir=path.join(s.home,'next','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),'process.exit(0)');assert.equal(archivePackage(path.dirname(dir),next,'v0.1.6').status,0);const r=run(s.home,['update','--version=v0.1.6'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:next});assert.equal(r.status,0,r.stderr);assert.equal(fs.readlinkSync(path.join(s.home,'.local/share/claudia/active')),'versions/v0.1.6');assert.ok(fs.existsSync(path.join(s.home,'.local/share/claudia/versions/v0.1.4/claudia')))});
test('v0.1.5 release without its required version helper is rejected',t=>{const s=setup(t),archive=path.join(s.home,'claudia-v0.1.5.tar.gz'),dir=path.join(s.home,'bad-legacy','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),'process.exit(0)');assert.equal(archivePackage(path.dirname(dir),archive,'v0.1.5').status,0);removeInstalledVersionHelper(dir);assert.equal(spawnSync('tar',['-czf',archive,'-C',path.dirname(dir),'claudia']).status,0);const r=run(s.home,['install','--version=v0.1.5'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:archive});assert.notEqual(r.status,0);assert.match(r.stderr,/Release package is missing required ClaudIA resources/);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/active')),false)});

test('versioned required files use SemVer precedence',t=>{
  const s=setup(t), installer=path.join(s.home,'src','claudia','claudia')
  const cases=[['v0.1.4',false],['v0.1.5',true],['v0.1.10',true],['v0.1.5-rc.1',false],['v0.1.6-alpha',true]]
  for(const [version,requiresHelper] of cases){
    const archive=path.join(s.home,`claudia-${version}.tar.gz`),dir=path.join(s.home,`semver-${version}`,'claudia')
    fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(installer,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),'process.exit(0)')
    const helper=path.join(dir,'claudia-model-manager-v2','installed-version.mjs')
    assert.equal(archivePackage(path.dirname(dir),archive,version).status,0)
    removeInstalledVersionHelper(dir);const manifestPath=path.join(dir,'package-manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.files=manifest.files.filter(entry=>entry.path!=='claudia-model-manager-v2/installed-version.mjs');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n')
    assert.equal(spawnSync('tar',['-czf',archive,'-C',path.dirname(dir),'claudia']).status,0)
    const result=run(s.home,['install',`--version=${version}`],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:archive})
    assert.equal(result.status===0,!requiresHelper,`${version}: ${result.stderr}`)
    fs.rmSync(path.join(s.home,'.local/share/claudia'),{recursive:true,force:true})
  }
})
test('latest resolves a semver tag and attests supplied archive',t=>{const s=setup(t);const r=run(s.home,['install','--latest'],s.env);assert.equal(r.status,0,r.stderr);assert.match(fs.readFileSync(s.env.GH_LOG,'utf8'),/release view/);assert.match(fs.readFileSync(s.env.GH_LOG,'utf8'),/attestation verify/)});
test('failed activation restores previous active pointer and launcher',t=>{const s=setup(t);assert.equal(run(s.home,['install','--version=v1.2.3'],s.env).status,0);const launcher=fs.readFileSync(path.join(s.home,'.local/bin/claudia'));const active=fs.readlinkSync(path.join(s.home,'.local/share/claudia/active'));const bad=path.join(s.home,'claudia-v1.2.4.tar.gz');const dir=path.join(s.home,'bad','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),'process.exit(9)');archivePackage(path.dirname(dir),bad,'v1.2.4');const r=run(s.home,['update','--version=v1.2.4'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:bad});assert.notEqual(r.status,0);assert.equal(fs.readlinkSync(path.join(s.home,'.local/share/claudia/active')),active);assert.deepEqual(fs.readFileSync(path.join(s.home,'.local/bin/claudia')),launcher)});
test('installer failure restores managed config bytes',t=>{const s=setup(t);const original=fs.readFileSync(path.join(s.op,'opencode.json'));const bad=path.join(s.home,'claudia-v1.2.3.tar.gz');const dir=path.join(s.home,'bad','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),`import fs from 'node:fs';const p=process.env.HOME+'/.config/opencode/opencode.json';fs.writeFileSync(p,'{"user":"mutated"}');process.exit(7)`);archivePackage(path.dirname(dir),bad,'v1.2.3');const r=run(s.home,['install','--version=v1.2.3'],{...s.env,CLAUDIA_VERIFIED_ARCHIVE:bad});assert.notEqual(r.status,0);assert.deepEqual(fs.readFileSync(path.join(s.op,'opencode.json')),original);assert.equal(fs.existsSync(path.join(s.home,'.local/share/claudia/active')),false)});
test('uninstall removes only owned version files and preserves shared state',t=>{const s=setup(t);assert.equal(run(s.home,['install','--version=v1.2.3'],s.env).status,0);const shared=path.join(s.home,'.local/share/key-manager/.local-key');fs.mkdirSync(path.dirname(shared),{recursive:true});fs.writeFileSync(shared,'keep');fs.writeFileSync(path.join(s.op,'user.json'),'keep');const r=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(shared,'utf8'),'keep');assert.equal(fs.readFileSync(path.join(s.op,'user.json'),'utf8'),'keep');assert.equal(fs.existsSync(path.join(s.home,'.local/bin/claudia')),false)});
test('uninstall preserves OpenCode values changed by the user after install',t=>{const s=setup(t);const archive=path.join(s.home,'claudia-v1.2.3.tar.gz');const dir=path.join(s.home,'cfg','claudia');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(cli,path.join(dir,'claudia'));fs.writeFileSync(path.join(dir,'install-claudia-orchestration.mjs'),`import fs from 'node:fs';const p=process.env.HOME+'/.config/opencode/opencode.json';fs.writeFileSync(p,JSON.stringify({custom:true,managed:'installed'}))`);archivePackage(path.dirname(dir),archive,'v1.2.3');const env={...s.env,CLAUDIA_VERIFIED_ARCHIVE:archive};assert.equal(run(s.home,['install','--version=v1.2.3'],env).status,0);fs.writeFileSync(path.join(s.op,'opencode.json'),JSON.stringify({custom:true,managed:'user-change'}));assert.equal(run(s.home,['uninstall'],{...env,CLAUDIA_CONFIRM:'y'}).status,0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.op,'opencode.json'))),{custom:true,managed:'user-change'})});
test('manifest traversal and symlinked parents are rejected',t=>{const s=setup(t);assert.equal(run(s.home,['install','--version=v1.2.3'],s.env).status,0);const manifest=path.join(s.home,'.local/share/claudia/manifest.json');const m=JSON.parse(fs.readFileSync(manifest));m.files=[{path:'../../.config/opencode/user.json',sha256:'0'.repeat(64)}];fs.writeFileSync(manifest,JSON.stringify(m));const traversal=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.notEqual(traversal.status,0);assert.ok(fs.existsSync(path.join(s.home,'.local/bin/claudia')));const version=path.join(s.home,'.local/share/claudia/versions/v1.2.3');const outside=path.join(s.home,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'key-manager.py'),'keep');fs.renameSync(path.join(version,'skills'),path.join(version,'skills-data'));fs.symlinkSync(outside,path.join(version,'skills'));m.files=[{path:'skills/key-manager/key-manager.py',sha256:'0'.repeat(64)}];fs.writeFileSync(manifest,JSON.stringify(m));const parentLink=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.notEqual(parentLink.status,0);assert.equal(fs.readFileSync(path.join(outside,'key-manager.py'),'utf8'),'keep');fs.rmSync(path.join(version,'skills'));fs.renameSync(path.join(version,'skills-data'),path.join(version,'skills'));m.files=[{path:'claudia',sha256:'0'.repeat(64)}];fs.writeFileSync(manifest,JSON.stringify(m));fs.renameSync(path.join(version,'claudia'),path.join(version,'real'));fs.symlinkSync(path.join(version,'real'),path.join(version,'claudia'));const link=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.notEqual(link.status,0);assert.ok(fs.existsSync(path.join(version,'claudia')))});
test('uninstall refuses omitted or altered manifest entries without deleting package',t=>{const s=setup(t);assert.equal(run(s.home,['install','--version=v1.2.3'],s.env).status,0);const manifestPath=path.join(s.home,'.local/share/claudia/manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));manifest.files.pop();fs.writeFileSync(manifestPath,JSON.stringify(manifest));let r=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.notEqual(r.status,0);assert.ok(fs.existsSync(path.join(s.home,'.local/share/claudia/active')));manifest.files=JSON.parse(fs.readFileSync(path.join(s.home,'.local/share/claudia/versions/v1.2.3/package-manifest.json'))).files.map(x=>x);manifest.files.push({path:'package-manifest.json',sha256:'0'.repeat(64)});fs.writeFileSync(manifestPath,JSON.stringify(manifest));r=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y'});assert.notEqual(r.status,0);assert.ok(fs.existsSync(path.join(s.home,'.local/share/claudia/active')))});
test('uninstall quarantines only the exact active pointer and launcher identities',t=>{for(const hook of ['replace-active','replace-launcher']){const s=setup(t);assert.equal(run(s.home,['install','--version=v1.2.3'],s.env).status,0);const sentinel=path.join(s.home,'sentinel');fs.writeFileSync(sentinel,'preserve');const r=run(s.home,['uninstall'],{...s.env,CLAUDIA_CONFIRM:'y',CLAUDIA_TEST_UNINSTALL_HOOK:hook});assert.notEqual(r.status,0);assert.equal(fs.readFileSync(sentinel,'utf8'),'preserve');assert.ok(fs.existsSync(path.join(s.home,'.local/share/claudia/versions/v1.2.3/claudia')));if(hook==='replace-active')assert.ok(fs.lstatSync(path.join(s.home,'.local/share/claudia/active')).isSymbolicLink());else assert.ok(fs.lstatSync(path.join(s.home,'.local/bin/claudia')).isSymbolicLink())}});
test('release workflow fails closed and pins actions at full immutable SHAs',()=>{const workflow=fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8');assert.match(workflow,/gh release create/);assert.doesNotMatch(workflow,/gh release view/);assert.match(workflow,/test "\$\(git rev-parse "refs\/tags\/\$GITHUB_REF_NAME\^\{commit\}"\)" = "\$GITHUB_SHA"/);assert.match(workflow,/permissions:\n  contents: read/);assert.match(workflow,/      contents: write\n      id-token: write\n      attestations: write/);const actions=workflow.split('\n').filter(l=>/^\s*-?\s*uses:/.test(l));assert.ok(actions.length>0);for(const line of actions){assert.match(line,/@[a-f0-9]{40}(?:\s+#.*)?$/);assert.doesNotMatch(line,/@v\d|@main(?:\s|$)/)}assert.ok(actions.some(line=>line.includes('actions/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a')))})

function bootstrapFixture(t, releaseTag='v1.2.3', rejectAttestation=false) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'claudia bootstrap test '));t.after(()=>fs.rmSync(base,{recursive:true,force:true}))
  const mock=path.join(base,'mock bin');fs.mkdirSync(mock)
  const log=path.join(base,'commands.log')
  const writeExecutable=(name,body)=>{const file=path.join(mock,name);fs.writeFileSync(file,`#!/bin/sh\n${body}\n`);fs.chmodSync(file,0o755)}
  writeExecutable('gh',`printf 'gh:%s\\n' "$*" >> "$BOOTSTRAP_TEST_LOG"\ncase "$1" in\n  release) if [ "$2" = view ]; then printf '%s\\n' "$BOOTSTRAP_TEST_TAG"; else for arg do dir=$arg; done; touch "$dir/claudia-$BOOTSTRAP_TEST_TAG.tar.gz"; fi ;;\n  attestation) [ "${rejectAttestation ? '1' : '0'}" != 1 ] ;;\n  *) exit 90 ;;\nesac`)
  writeExecutable('tar',`printf 'tar:%s\\n' "$*" >> "$BOOTSTRAP_TEST_LOG"\n[ "$1" = -xzf ] || exit 91\nprev=; dest=; for arg do if [ "$prev" = -C ]; then dest=$arg; fi; prev=$arg; done\nmkdir -p "$dest/claudia"\n: > "$dest/claudia/claudia"`)
  writeExecutable('node',`printf 'node:%s\\n' "$*" >> "$BOOTSTRAP_TEST_LOG"\nprintf 'archive=%s\\ntag=%s\\n' "$CLAUDIA_VERIFIED_ARCHIVE" "$3" > "$BOOTSTRAP_TEST_RESULT"`)
  const env={...process.env,HOME:path.join(base,'isolated home'),PATH:`${mock}:${process.env.PATH}`,BOOTSTRAP_TEST_LOG:log,BOOTSTRAP_TEST_TAG:releaseTag,BOOTSTRAP_TEST_RESULT:path.join(base,'result')}
  return {base,log,env,result:env.BOOTSTRAP_TEST_RESULT}
}

test('bootstrap verifies exact release asset before install and handles spaces in paths',t=>{
  const f=bootstrapFixture(t)
  const r=spawnSync(path.join(root,'bootstrap.sh'),[],{encoding:'utf8',env:f.env})
  assert.equal(r.status,0,r.stderr)
  const log=fs.readFileSync(f.log,'utf8').trim().split('\n')
  assert.match(log[0],/^gh:release view --repo netcraker01\/ClaudIA --json tagName --jq \.tagName$/)
  assert.match(log[1],/^gh:release download v1\.2\.3 --repo netcraker01\/ClaudIA --pattern claudia-v1\.2\.3\.tar\.gz --dir \/.*claudia-bootstrap\./)
  assert.match(log[2],/^gh:attestation verify .*claudia-v1\.2\.3\.tar\.gz --repo netcraker01\/ClaudIA --signer-workflow netcraker01\/ClaudIA\/\.github\/workflows\/release\.yml$/)
  assert.match(log[3],/^tar:-xzf .*claudia-v1\.2\.3\.tar\.gz -C \/.*claudia-bootstrap\./)
  assert.match(log[4],/^node:.*\/claudia\/claudia install --version=v1\.2\.3$/)
  assert.match(fs.readFileSync(f.result,'utf8'),/^archive=\/tmp\/claudia-bootstrap\..*\/claudia-v1\.2\.3\.tar\.gz$/m)
  assert.match(fs.readFileSync(f.result,'utf8'),/^tag=--version=v1\.2\.3$/m)
  const tempDir=log[1].match(/--dir (.*)$/)[1]
  assert.equal(fs.existsSync(tempDir),false,'temporary bootstrap directory should be cleaned')
})

test('bootstrap rejects invalid release tags before downloading',t=>{
  const f=bootstrapFixture(t,'v01.2.3')
  const r=spawnSync(path.join(root,'bootstrap.sh'),[],{encoding:'utf8',env:f.env})
  assert.notEqual(r.status,0)
  assert.match(r.stderr,/invalid release tag/)
  assert.equal(fs.readFileSync(f.log,'utf8').trim().split('\n').length,1)
})

test('bootstrap stops before extraction or install when attestation fails',t=>{
  const f=bootstrapFixture(t,'v1.2.3',true)
  const r=spawnSync(path.join(root,'bootstrap.sh'),[],{encoding:'utf8',env:f.env})
  assert.notEqual(r.status,0)
  const log=fs.readFileSync(f.log,'utf8')
  assert.match(log,/gh:attestation verify/)
  assert.doesNotMatch(log,/tar:|node:/)
  assert.equal(fs.existsSync(f.result),false)
  const tempDir=log.match(/--dir (.*)$/m)[1]
  assert.equal(fs.existsSync(tempDir),false,'temporary bootstrap directory should be cleaned after failure')
})

test('package manager hints cover Arch, Debian, and unknown distro', async () => {
  const source = await import('../lib/distro-hint.mjs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'distro-test-'))
  try {
    const check = (text) => { const file = path.join(dir, 'os-release'); fs.writeFileSync(file, text); return source.packageManagerHint(file) }
    assert.match(check('ID=arch\nNAME=Arch Linux\n'), /pacman -S nodejs npm github-cli python gnupg tar/)
    assert.match(check('ID=omarchy\nID_LIKE="arch"\n'), /pacman/)
    assert.equal(check('ID=ubuntu\nID_LIKE=debian\n'), 'En Debian/Ubuntu: sudo apt install')
    assert.equal(check('ID=void\n'), null)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
