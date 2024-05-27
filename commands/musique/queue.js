const dotenv = require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder} = require('discord.js');
const fetch = require('node-fetch');
const request = require('request');
const spawn = require('child_process').exec;
const client_id = process.env.SPOTIFY_CLIENT_ID;
const { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, NoSubscriberBehavior} = require('@discordjs/voice');
const {existsSync, unlinkSync, rmdirSync, readdirSync} = require("node:fs");
const {executeCommand, getSongPath, generateToken} = require('../../utils.js');

const regex = /^(https?:\/\/open\.spotify\.com\/(playlist|intl-\w+\/track)\/([a-zA-Z0-9]+)\?si=([a-zA-Z0-9]+))$/;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a spotify song or playlist.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the song or playlist.'))
        .addBooleanOption(option =>
            option.setName('setToTop')
                .setDescription('Set the song to the top of the queue.')),
    async execute(interaction) {

    },
};
