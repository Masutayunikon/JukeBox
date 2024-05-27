const fetch = require('node-fetch');
const spawn = require('child_process').exec;
const {existsSync} = require("node:fs");

function executeCommand(command, args) {
    // Wrap the spawn process into a Promise
    return new Promise((resolve, reject) => {
        const process = spawn(command + ' ' + args.join(' '));
        let processData = '';

        process.stdout.on('data', data => {
            processData += data.toString();
        });

        process.on('close', _ => {
            resolve(processData);
        });

        process.on('error', reject);
    });
}

async function getSongPath(track) {
    const songPath = `./songs/${track.artists[0].name}/${track.album.name}/${track.artists[0].name} - ${track.name}.mp3`;

    if (existsSync(songPath)) {
        return songPath;
    }

    console.log(`Downloading: ${track.external_urls.spotify}`);
    const command = 'zotify';
    const args = [`${track.external_urls.spotify}`, '--download-lyrics=False', '--print-skips=false', '--download-format=mp3', '--download-quality=very_high', '--root-path=./songs', '--print-download-progress=false', '--print-errors=false', '--print-downloads=true'];

    try {
        const stdout = await executeCommand(command, args);

        console.log(`stdout: ${stdout}`);

        const regex = /Downloaded "(.+)" to "(.+)"/;
        const matches = stdout.match(regex);

        if (matches) {
            const directory = matches[2];
            console.log(`Directory: ${directory}`);
            return `./songs/${directory}`;
        } else {
            console.log("No match found.");
            return null;
        }
    } catch (error) {
        console.error(`exec error: ${error}`);
        return null;
    }
}

async function generateToken() {
    let token = '';

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', authOptions);

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        const data = await response.json();
        token = data.access_token;

        // Replace this with your code
        //console.log(token);

    } catch (error) {
        console.log('Error:', error);
        return null;
    }

    return token;
}

let authOptions = {
    method: 'POST',
    headers: {
        'Authorization': 'Basic ' + (new Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')),
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: "grant_type=client_credentials"
};


module.exports = {
    executeCommand,
    getSongPath,
    generateToken
}
