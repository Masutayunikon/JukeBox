const dotenv = require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder} = require('discord.js');
const fetch = require('node-fetch');
const request = require('request');
const spawn = require('child_process').exec;
const client_id = process.env.SPOTIFY_CLIENT_ID;
const { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, NoSubscriberBehavior} = require('@discordjs/voice');
const { existsSync } = require("fs");
const {unlinkSync} = require("node:fs");
let {players} = require('../../index.js');

if (players === undefined) {
    players = {};
}

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

async function getSongPath(item) {
    const songPath = `./songs/${item.track.artists[0].name}/${item.track.album.name}/${item.track.artists[0].name} - ${item.track.name}.mp3`;

    if (existsSync(songPath)) {
        return songPath;
    }

    const command = 'zotify';
    const args = [`${item.track.external_urls.spotify}`, '--download-lyrics=False', '--print-skips=false', '--download-format=mp3', '--download-quality=very_high', '--root-path=./songs', '--print-download-progress=false', '--print-errors=false', '--print-downloads=true'];

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

const regex = /^(https?:\/\/open\.spotify\.com\/(playlist|intl-\w+\/track)\/([a-zA-Z0-9]+)\?si=([a-zA-Z0-9]+))$/;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a spotify song or playlist.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the song or playlist.'))
        .addBooleanOption(option =>
            option.setName('shuffle')
                .setDescription('Shuffle the playlist.')),
    async execute(interaction) {

        // check if the link match the regex
        const link = interaction.options.getString('link');

        if (!regex.test(link)) {
            await interaction.reply('The link is not valid.');
            return;
        } else {
            await interaction.reply('We downloaded the song. Please wait a few seconds.');
        }

        // if the link is a playlist get each song
        let songs = [];

        if (link.includes('playlist')) {
            const playlistId = link.split('/')[4];
            const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
            const playlistOptions = {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + await generateToken()
                }
            };

            const channel = interaction.member.voice.channel;

            const name = channel.guild.id + '-' + channel.id;

            try {
                const response = await fetch(playlistUrl, playlistOptions);

                if (!response.ok) {
                    throw new Error(response.statusText);
                }

                const data = await response.json();

                players[name] = {
                    player: null,
                    connection: null,
                    subscription: null,
                    playlist: [],
                    next: null,
                    current: null,
                    currentSongPath: null,
                    count: 0,
                    active: false,
                    interaction: interaction,
                }

                for (const track of data.tracks.items) {
                    players[name].playlist.push(track);
                }

                if (interaction.options.getBoolean('shuffle')) {
                    players[name].playlist.sort(() => Math.random() - 0.5);
                }

                let path = await getSongPath(players[name].playlist[0]);

                while (path === null && players[name].playlist.length > 1) {
                    players[name].playlist.shift();
                    path = await getSongPath(players[name].playlist[0]);
                }

                if (channel && path !== null) {

                    players[name].currentSongPath = path;

                    // check if patj exists
                    while (!existsSync(path)) {
                        // sleep 1s
                        await new Promise(r => setTimeout(r, 1000));

                        console.log('Waiting for the file to be downloaded.: ' + path);
                    }

                    players[name].player = createAudioPlayer({
                        behaviors: {
                            noSubscriber: NoSubscriberBehavior.Pause,
                        },
                    });

                    players[name].player.on(AudioPlayerStatus.Idle, () => {
                        console.log('Idle');
                        console.log(players[name].next !== null);
                        if (players[name].next !== null) {
                            players[name].resource = createAudioResource(players[name].next);
                            // delete the current song files with fs
                            console.log('Deleting:', players[name].currentSongPath);

                            unlinkSync(players[name].currentSongPath);
                            players[name].currentSongPath = players[name].next;
                            players[name].player.play(players[name].resource);
                        }

                    });

                    players[name].player.on(AudioPlayerStatus.Playing, async() => {
                        console.log('Playing');

                        if (!players[name].active) {
                            players[name].active = true;
                            return;
                        }

                        if (players[name].playlist.length > 1 && players[name].active) {
                            console.log(JSON.stringify(players[name].playlist[0], null, 2));

                            // request to item.artists[0].href
                            const artistOptions = {
                                method: 'GET',
                                headers: {
                                    Authorization: 'Bearer ' + await generateToken()
                                }
                            }

                            const artistResponse = await fetch(players[name].playlist[0].track.artists[0].href, artistOptions);

                            const author = {
                                name: "",
                                url: "",
                                iconURL: ""
                            }

                            if (artistResponse.ok) {
                                const artistData = await artistResponse.json();
                                author.name = artistData.name;
                                author.url = artistData.external_urls.spotify;
                                author.iconURL = artistData.images[0].url;
                            }

                            let title = players[name].playlist[0].track.name;

                            // add space to the title to make 100 characters long
                            while (title.length < 100) {
                                title += ' ';
                            }

                            const embed = new EmbedBuilder()
                                .setAuthor(author)
                                .setTitle(title)
                                .setURL(players[name].playlist[0].track.external_urls.spotify)
                                .setThumbnail(players[name].playlist[0].track.album.images[0].url)
                                .setColor("#0cad00")
                                .setFooter({
                                    text: "JukeBot",
                                })
                                .setTimestamp();

                            interaction.guild.channels.cache.get(interaction.channelId).send({ embeds: [embed] });

                            players[name].playlist.shift();
                            players[name].next = await getSongPath(players[name].playlist[0]);
                            console.log(players[name].next);
                        } else {
                            console.log('No next song', players[name].playlist.length, players[name].player.state.playbackDuration);
                            players[name].next = null;
                        }
                    });

                    players[name].connection = joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                    });

                    players[name].resource = createAudioResource(path);

                    players[name].next = 'test'

                    players[name].player.play(players[name].resource);

                    players[name].subscription = players[name].connection.subscribe(players[name].player);

                } else {
                    await interaction.reply('You need to join a voice channel first!');
                }

            } catch (error) {
                console.log('Error:', error);
            }
        }
    },
};
