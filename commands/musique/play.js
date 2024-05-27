const { SlashCommandBuilder, EmbedBuilder} = require('discord.js');
const fetch = require('node-fetch');
const { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, NoSubscriberBehavior} = require('@discordjs/voice');
const {existsSync, unlinkSync} = require("node:fs");
let {players} = require('../../index.js');
const {getSongPath, generateToken} = require('../../utils.js');

if (players === undefined) {
    players = {};
}

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

        if (link.includes('playlist') || link.includes('track') ) {

            let url = '';
            let options = {};

            if (link.includes('playlist')) {
                const playlistId = link.split('/')[4];
                url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
                options = {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + await generateToken()
                    }
                };
            }

            if (link.includes('track')) {
                const removeSiRegex = '\\?si=.*$';
                url = link.replace(new RegExp(removeSiRegex), '');

                const trackId = link.split('/').pop();
                url = `https://api.spotify.com/v1/tracks/${trackId}`;
                options = {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + await generateToken()
                    }
                };
            }

            const channel = interaction.member.voice.channel;

            const name = channel.guild.id + '-' + channel.id;

            let data = {};

            try {
                console.log('Fetching:', url);
                const response = await fetch(url, options);

                if (!response.ok) {
                    throw new Error(response.statusText);
                }

                data = await response.json();

            } catch (error) {
                console.log('Error:', error);
            }

            players[name] = {
                player: null,
                connection: null,
                subscription: null,
                playlist: [],
                next: null,
                current: null,
                currentSongPath: null,
                count: 0,
                active: players[name] ? players[name].active : false,
                interaction: interaction,
            }

            if (link.includes('playlist')) {
                for (const item of data.tracks.items) {
                    players[name].playlist.push(item.track);
                }

                console.log("playlist length: " + players[name].playlist.length);

                if (interaction.options.getBoolean('shuffle')) {
                    players[name].playlist.sort(() => Math.random() - 0.5);
                }
            } else {
                players[name].playlist.push(data);
            }

            let path = await getSongPath(players[name].playlist[0]);

            console.log('Path:', path);

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

                    if (players[name].next !== null) {
                        players[name].resource = createAudioResource(players[name].next);
                        // delete the current song files with fs
                        console.log('Deleting:', players[name].currentSongPath);

                        unlinkSync(players[name].currentSongPath);

                        // for each subdirectory before the song check if its contains mp3 files otherwise delete it

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

                    if (players[name].playlist.length > 0 && players[name].active) {

                        // request to item.artists[0].href
                        const artistOptions = {
                            method: 'GET',
                            headers: {
                                Authorization: 'Bearer ' + await generateToken()
                            }
                        }

                        const artistResponse = await fetch(players[name].playlist[0].artists[0].href, artistOptions);

                        const author = {
                            name: "",
                            url: "",
                            iconURL: ""
                        }

                        if (artistResponse.ok) {
                            const artistData = await artistResponse.json();
                            author.name = artistData.name;
                            author.url = artistData.external_urls.spotify;
                            author.iconURL = artistData.images[0].url ? artistData.images[0].url : "";
                        }

                        let title = players[name].playlist[0].name;

                        // add space to the title to make 100 characters long
                        while (title.length < 100) {
                            title += ' ';
                        }

                        const embed = new EmbedBuilder()
                            .setAuthor(author)
                            .setTitle(title)
                            .setURL(players[name].playlist[0].external_urls.spotify)
                            .setThumbnail(players[name].playlist[0].album.images[0].url)
                            .setColor("#0cad00")
                            .setFooter({
                                text: "JukeBot",
                            })
                            .setTimestamp();

                        interaction.guild.channels.cache.get(interaction.channelId).send({ embeds: [embed] });

                        players[name].playlist.shift();

                        if (players[name].playlist.length > 0) {
                            players[name].next = await getSongPath(players[name].playlist[0]);
                            console.log(players[name].next);
                        }
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

                players[name].player.play(players[name].resource);

                players[name].subscription = players[name].connection.subscribe(players[name].player);

            } else {
                await interaction.reply('You need to join a voice channel first!');
            }
        }
    },
};
