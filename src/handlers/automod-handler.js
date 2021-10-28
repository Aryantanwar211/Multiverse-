const { Message, MessageEmbed } = require("discord.js");
const { sendMessage, safeDM } = require("@utils/botUtils");
const { containsLink, containsDiscordInvite } = require("@utils/miscUtils");
const { addStrikes } = require("@schemas/profile-schema");
const { addModAction } = require("@utils/modUtils");
const { EMBED_COLORS } = require("@root/config");

/**
 * Check if the message needs to be moderated and has required permissions
 * @param {Message} message
 */
const shouldModerate = (message) => {
  const { member, guild, channel } = message;

  // Ignore if bot cannot delete channel messages
  if (!channel.permissionsFor(guild.me).has("MANAGE_MESSAGES")) return false;

  // Ignore Possible Guild Moderators
  if (member.permissions.has(["KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_GUILD"])) return false;

  // Ignore Possible Channel Moderators
  if (channel.permissionsFor(message.member).has("MANAGE_MESSAGES")) return false;
  return true;
};

/**
 * Perform moderation on the message
 * @param {Message} message
 */
async function performAutomod(message, settings) {
  const { automod } = settings;

  if (!automod.debug && !shouldModerate(message)) return;

  const { channel, content, author, mentions } = message;
  const logChannel = settings.modlog_channel ? channel.guild.channels.cache.get(settings.modlog_channel) : null;

  let shouldDelete = false;
  let strikesTotal = 0;

  const embed = new MessageEmbed();

  // Max mentions
  if (mentions.members.size > automod.max_mentions) {
    embed.addField("Mentions", `${mentions.members.size}/${automod.max_mentions}`, true);
    strikesTotal += mentions.members.size - automod.max_mentions;
  }

  // Maxrole mentions
  if (mentions.roles.size > automod.max_role_mentions) {
    embed.addField("RoleMentions", `${mentions.roles.size}/${automod.max_role_mentions}`, true);
    strikesTotal += mentions.roles.size - automod.max_role_mentions;
  }

  // Max Lines
  if (automod.max_lines > 0) {
    const count = content.split("\n").length;
    if (count > automod.max_lines) {
      embed.addField("New Lines", `${count}/${automod.max_lines}`, true);
      strikesTotal += Math.ceil((count - automod.max_lines) / automod.max_lines);
    }
  }

  // Anti links
  if (automod.anti_links) {
    if (containsLink(content)) {
      embed.addField("Links Found", message.client.config.EMOJIS.TICK, true);
      shouldDelete = true;
      strikesTotal += 1;
    }
  }

  // Anti Scam
  if (!automod.anti_links && automod.anti_scam) {
    if (containsLink(content)) {
      const key = message.author.id + "|" + message.guildId;
      if (message.client.antiScamCache.has(key)) {
        let antiScamInfo = message.client.antiScamCache.get(key);
        if (
          antiScamInfo.channelId !== message.channelId &&
          antiScamInfo.content === content &&
          Date.now() - antiScamInfo.timestamp < 2000
        ) {
          embed.addField("AntiScam Detection", message.client.config.EMOJIS.TICK, true);
          shouldDelete = true;
          strikesTotal += 1;
        }
      } else {
        let antiScamInfo = {
          channelId: message.channelId,
          content,
          timestamp: Date.now(),
        };
        message.client.antiScamCache.set(key, antiScamInfo);
      }
    }
  }

  // Anti Invites
  if (!automod.anti_links && automod.anti_invites) {
    if (containsDiscordInvite(content)) {
      embed.addField("Discord Invites", message.client.config.EMOJIS.TICK, true);
      shouldDelete = true;
      strikesTotal += 1;
    }
  }

  // delete message if deletable
  if (shouldDelete && message.deletable) {
    message
      .delete()
      .then(() => sendMessage(channel, "> Auto-Moderation! Message deleted", 5))
      .catch(() => {});
  }

  if (strikesTotal > 0) {
    // add strikes to member
    const profile = await addStrikes(message.guildId, author.id, strikesTotal);

    // send automod log
    embed
      .setAuthor("Auto Moderation")
      .setThumbnail(author.displayAvatarURL())
      .setColor(message.client.config.EMBED_COLORS.AUTOMOD)
      .setDescription(`**Channel:** ${channel.toString()}\n**Content:**\n${content}`)
      .setFooter(`By ${author.tag} | ${author.id}`, author.avatarURL());

    sendMessage(logChannel, { embeds: [embed] });

    // DM strike details
    const strikeEmbed = new MessageEmbed()
      .setColor(EMBED_COLORS.TRANSPARENT_EMBED)
      .setThumbnail(message.guild.iconURL())
      .setAuthor("Auto Moderation")
      .setDescription(
        `You have received ${strikesTotal} strikes!\n\n` +
          `**Guild:** ${message.guild.name}\n` +
          `**Total Strikes:** ${profile.strikes}/${automod.strikes}`
      );
    embed.fields.forEach((field) => strikeEmbed.addField(field.name, field.value, true));
    safeDM(message.author, { embeds: [strikeEmbed] });

    // check if max strikes are received
    if (profile.strikes >= automod.strikes) {
      await addModAction(message.guild.me, message.member, "Automod: Max strikes received", automod.action); // Add Moderation Action
      await addStrikes(message.guildId, message.member.id, -profile.strikes); // Reset Strikes
    }
  }
}

module.exports = {
  performAutomod,
};
