const os = require('os');
const http = require('http');
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { exec, execSync } = require('child_process');
function ensureModule(name) {
    try {
        require.resolve(name);
    } catch (e) {
        console.error(`Module '${name}' not found. Installing...`);
        execSync(`npm install ${name}`, { stdio: 'inherit' });
    }
}
ensureModule('axios');
ensureModule('ws');
const axios = require('axios');
const { WebSocket, createWebSocketStream } = require('ws');
//const WebSocket = require('ws');
//const createWebSocketStream = require('ws');
const logcb = (...args) => console.log.bind(this, ...args);
const errcb = (...args) => console.error.bind(this, ...args);
const UUID = process.env.UUID || 'b28f60af-d0b9-4ddf-baaa-7e49c93c380b';
const uuid = UUID.replace(/-/g, "");
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '443';        // 端口为443时自动开启tls
const NEZHA_KEY = process.env.NEZHA_KEY || '';             // 哪吒三个变量不全不运行
const DOMAIN = process.env.DOMAIN || '';  //项目域名或已反代的域名，不带前缀，建议填已反代的域名
const NAME = process.env.NAME || 'webhostmost-GCP';
const PORT = process.env.PORT || 3000;



// 判断系统架构
function getSystemArchitecture() {
    const arch = os.arch();
    if (arch === 'arm' || arch === 'arm64') {
        return 'arm';
    } else {
        return 'amd';
    }
}

// 下载对应系统架构的ne-zha
function downloadFile(fileName, fileUrl, callback) {
    const filePath = path.join("./", fileName);
    const writer = fs.createWriteStream(filePath);
    axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
    })
        .then(response => {
            response.data.pipe(writer);
            writer.on('finish', function () {
                writer.close();
                callback(null, fileName);
            });
        })
        .catch(error => {
            callback(`Download ${fileName} failed: ${error.message}`);
        });
}

function downloadFiles() {
    const architecture = getSystemArchitecture();
    const filesToDownload = getFilesForArchitecture(architecture);

    if (filesToDownload.length === 0) {
        console.log(`Can't find a file for the current architecture`);
        return;
    }

    let downloadedCount = 0;

    filesToDownload.forEach(fileInfo => {
        downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
            if (err) {
                console.log(`Download ${fileName} failed`);
            } else {
                console.log(`Download ${fileName} successfully`);

                downloadedCount++;

                if (downloadedCount === filesToDownload.length) {
                    setTimeout(() => {
                        authorizeFiles();
                    }, 3000);
                }
            }
        });
    });
}

function getFilesForArchitecture(architecture) {
    if (architecture === 'arm') {
        return [
            { fileName: "npm", fileUrl: "https://github.com/eooce/test/releases/download/ARM/swith" },
        ];
    } else if (architecture === 'amd') {
        return [
            { fileName: "npm", fileUrl: "https://github.com/eooce/test/releases/download/bulid/swith" },
        ];
    }
    return [];
}

// 授权并运行ne-zha
function authorizeFiles() {
    const filePath = './npm';
    const newPermissions = 0o775;
    fs.chmod(filePath, newPermissions, (err) => {
        if (err) {
            console.error(`Empowerment failed:${err}`);
        } else {
            console.log(`Empowerment success:${newPermissions.toString(8)} (${newPermissions.toString(10)})`);

            // 运行ne-zha
            let NEZHA_TLS = '';
            if (NEZHA_SERVER && NEZHA_PORT && NEZHA_KEY) {
                if (NEZHA_PORT === '443') {
                    NEZHA_TLS = '--tls';
                } else {
                    NEZHA_TLS = '';
                }
                const command = `./npm -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --skip-conn --disable-auto-update --skip-procs --report-delay 4 >/dev/null 2>&1 &`;
                try {
                    exec(command);
                    console.log('npm is running');
                } catch (error) {
                    console.error(`npm running error: ${error}`);
                }
            } else {
                console.log('NEZHA variable is empty,skip running');
            }
        }
    });
}
// 创建HTTP路由
const httpServer = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello, World-YGkkk\n');
    } else if (req.url === `/${UUID}`) {
        const vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F#Vl-ws-tls-${NAME}`;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(vlessURL + '\n');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found\n');
    }
});

httpServer.listen(PORT, () => {
    console.error(`HTTP Server is running on port ${PORT}`);
});

// WebSocket 服务器
const wss = new WebSocket.Server({ server: httpServer });
wss.on('connection', ws => {
   // console.error("WebSocket 连接成功");
    ws.once('message', msg => {
        const [VERSION] = msg;
        const id = msg.slice(1, 17);
        if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) {
            console.error("UUID 验证失败");
            return;
        }
        let i = msg.slice(17, 18).readUInt8() + 19;
        const port = msg.slice(i, i += 2).readUInt16BE(0);
        const ATYP = msg.slice(i, i += 1).readUInt8();
        const host = ATYP === 1 ? msg.slice(i, i += 4).join('.') :
            (ATYP === 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
                (ATYP === 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));
        // console.error('连接到:', host, port);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(new Uint8Array([VERSION, 0]));
            const duplex = createWebSocketStream(ws);
            net.connect({ host, port }, function () {
                this.write(msg.slice(i));
                duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
            }).on('error', () => { });
        }
    }).on('error', err => console.error("WebSocket 错误:", err.message));
});

downloadFiles();
