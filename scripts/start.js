// Lance Electron en retirant ELECTRON_RUN_AS_NODE (posé par certains terminaux, ex. VS Code),
// sinon Electron démarre comme un simple Node et l'app ne s'ouvre pas.
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env, cwd: require('path').join(__dirname, '..') });
child.on('exit', (code) => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
