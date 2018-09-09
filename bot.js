const Discord = require('discord.js');
const bot = new Discord.Client();
const ytDownload = require('ytdl-core');
const request = require('request');
const fs = require('fs');
const getYoutubeID = require('get-youtube-id');
const fetchVideoInfo = require('youtube-info');
const ypi = require('youtube-playlist-info');

var config = JSON.parse(fs.readFileSync('settings.json'));

const ytAPIkey = config.ytAPIkey;
const prefix = config.prefix;
const token = config.botToken;
const usernameID = config.usernameID;




var queue = [];
var queueList = [];
var isPlaying = false;
var dispatcher = null;
var skipReq = 0;
var voiceChannel = null;
var skippers = [];
var volume = 0;
var defaultVolume = 20/100;

bot.on('message', message =>{
  const member = message.member;
  const mess = message.content.toLowerCase();
  const args = message.content.split(' ').slice(1).join(" ");

  //Command to queue songs
  if(mess.startsWith(prefix + "play")){
     if(member.voiceChannel){
        if(queue.length > 0 || isPlaying){
          getID(args, id =>{
            addToQueue(id);
            fetchVideoInfo(id, (err, videoInfo)=>{
              if(err) throw new Error(err);
                message.reply(" Added to queue: **" + videoInfo.title + "**");
                queueList.push(videoInfo.title);
            });
          });
        }
        else{
          isPlaying = true;
          getID(args, id=>{
            queue.push("placeholder");
            playMusic(id, message);
            fetchVideoInfo(id, (err, videoInfo)=>{
              if(err) throw new Error(err);
                message.reply(" Added to queue: **" + videoInfo.title + "**");
                queueList.push(videoInfo.title);
            });
          });
        }
      }
      else{
        message.reply('You must be in a voice channel!');
      }
  }
  else if (mess.startsWith(prefix + "plist")) {
        //check if message contains list
        if(member.voiceChannel){
          var someId = youtube_playlist_parser(args);

          if (someId) {

              ypi.playlistInfo(ytAPIkey, someId, function(playlistItems) {

                message.reply(" Adding to queue...");
                playlistItems.forEach(item =>{
                    queue.push(item.resourceId.videoId);
                    queueList.push(item.title);
                });
                message.reply("Succesfully added playlist to queue");
              });
              if(!isPlaying){
                isPlaying = true;
                getID(args, id=>{
                  //queue.push("placeholder");
                  playMusic(id, message);
                  fetchVideoInfo(id, (err, videoInfo)=>{
                    if(err) throw new Error(err);
                    queueList.push(videoInfo.title);
                  });
                });
              }
          } else {
              message.reply("Not a valid youtube playlist URL. Try again.");
          }
      }
      else{
        message.reply("You must be in a voice channel to use this command");
      }

    }

  //Command to skip songs
  else if(mess.startsWith(prefix + "skip")){
    if(skippers.indexOf(message.author.id) === -1){
      skippers.push(message.author.id);
      skipReq++;
      if(skipReq >= Math.ceil(voiceChannel.members.size - 1)  / 2 || message.author.id === usernameID){ //-1 because the bot shouldn't be included in the votes
        skipSong(message);
        message.reply(" Skip has been accepted, skipping song!");
      }
      else{
        message.reply(" Skip has been accepted, you need **"
        + ((Math.ceil((voiceChannel.members.size - 1) / 2)) - skipReq) + "** more skip votes.");
      }
    }
    else{
      message.reply("You already voted to skip");
    }
  }

  //Pauses music
  else if(mess.startsWith(prefix + "pause")){
    pauseMusic(message);
  }

  //Resumes music
  else if(mess.startsWith(prefix + "resume")){
    resumeMusic(message);
  }

  //Changes the volume of the song
  else if(mess.startsWith(prefix + "vol")){
      if(Number.isNaN(Number.parseInt(args, 10))){
          message.reply("That is not a valid number!");
      }
      else{
        if(args < 0 || args > 100){
         message.reply("Please enter a value from 0 to 100!");
         }
        else{
         volume = args/100; //The parameter takes values from 0 to 1, makes it easier for the user
         changeVolume(volume);
         message.reply("Volume set to: " + (volume*100) + "%");
       }
      }
  }

  //Kicks the bot from the voice channel
  else if(mess.startsWith(prefix + "leave")){
      queue = [];
      queueList = [];
      dispatcher.end();
      bot.user.setPresence({ status: 'online', game: { name: "Type !commands for commands" } });
      voiceChannel.leave();
    }

    //Shows the queue list
  else if(mess.startsWith(prefix + "list")){
    var format = "```";
    for(var i = 0; i < queueList.length; i++){
      var temp = (i + 1) + ". " + queueList[i] + (i === 0 ? "  (Current Song)" : "") + "\n";
      if((format + temp).length <= 2000 - 3){ //-3 because there are three ticks ```
        format += temp;
      }
      else{
        format += "```";
        message.channel.send(format);
        format = "```";
      }
    }
    format += "```";
    message.channel.send(format);
  }


  //PM's all of the bot's commands
  else if(mess.startsWith(prefix + "commands")){
    message.author.send("```\nList of commands\n\n!play => queues music\n!plist => queues a playlist\n!skip => skips song\n!vol => changes volume\n"
    + "!pause => pauses music\n!resume => resumes music\n!list => shows the queue\n!osu => shows osu stats of the user\n!define => defines a word thats in english```");
    }

});

bot.on('ready', () => {
  console.log('I am ready!');
  bot.user.setPresence({ status: 'online', game: { name: 'Type !commands for commands' } });
});

function playMusic(id, message){
  voiceChannel = message.member.voiceChannel;

  voiceChannel.join().then(connection =>{
    var stream = ytDownload("https://www.youtube.com/watch?v=" + id, {
      filter: 'audioonly'
    });
    skipReq = 0;
    skippers = [];

    dispatcher = connection.playStream(stream);
    fetchVideoInfo(id, (err, videoInfo)=>{
      if(err) throw new Error(err);
        bot.user.setPresence({ status: 'online', game: { name: videoInfo.title } });
    });

    dispatcher.setVolume(defaultVolume); //Defaults to 20%, personal preference to avoid ear damage
    dispatcher.on('end', ()=>{
      skipReq = 0;
      skippers = [];
      queue.shift();
      queueList.shift();
      if(queue.length === 0){
        queue = [];
        queueList = [];
        isPlaying = false;
      }
      else{
        setTimeout( ()=> {
            playMusic(queue[0], message);
        }, 500);

      }
      });
  });
}

function skipSong(message){
  dispatcher.end();
}

function pauseMusic(message){
  dispatcher.pause();
}

function resumeMusic(message){
  dispatcher.resume();
}

function changeVolume(message){
  dispatcher.setVolume(message);
}

function isYoutube(str){
  return str.toLowerCase().indexOf("youtube.com") > -1;
}

function getID(str, cb){
  if(isYoutube(str)){
    cb(getYoutubeID(str));
  }
  else{
    searchVideo(str, id => {
      cb(id);
    });
  }
}

function addToQueue(strID){
  if(isYoutube(strID)){
    queue.push(getYoutubeID(strID));
  }
  else{
    queue.push(strID);
  }
}

function searchVideo(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q="
    + encodeURIComponent(query) + "&key=" + ytAPIkey, (error, response, body)=> {
        var json = JSON.parse(body);
        if (!json.items[0]) callback("3_-a9nVZYjk");
        else {
            callback(json.items[0].id.videoId);
        }
    });
}

function youtube_playlist_parser(url) {

    var reg = new RegExp("[&?]list=([a-z0-9]+)", "i");
    var match = reg.exec(url);

    if (match && match[1].length > 0 && youtube_validate(url)) {
        return match[1];
    } else {
        return null;
    }

}

function youtube_validate(url) {

    var regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    return url.match(regExp) && url.match(regExp).length > 0;

}

bot.login(process.env.BOT_TOKEN);
