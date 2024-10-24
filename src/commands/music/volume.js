const { musicValidations } = require('@helpers/BotUtils')
const { ApplicationCommandOptionType } = require('discord.js')
const { MUSIC } = require('@src/config.js')

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: 'volume',
  description: 'set the music player volume',
  category: 'MUSIC',
  validations: musicValidations,

  slashCommand: {
    enabled: MUSIC.ENABLED,
    options: [
      {
        name: 'amount',
        description: 'Enter a value to set [0 to 100]',
        type: ApplicationCommandOptionType.Integer,
        required: false,
      },
    ],
  },

  async interactionRun(interaction) {
    const amount = interaction.options.getInteger('amount')
    const response = await volume(interaction, amount)
    await interaction.followUp(response)
  },
}

/**
 * @param {import("discord.js").CommandInteraction|import("discord.js").Message} arg0
 */
async function volume({ client, guildId }, volume) {
  const player = client.musicManager.getPlayer(guildId)

  if (!volume) return `> The player volume is \`${player.volume}\`.`
  if (volume < 1 || volume > 100)
    return 'you need to give me a volume between 1 and 100.'

  await player.setVolume(volume)
  return `🎶 Music player volume is set to \`${volume}\`.`
}
