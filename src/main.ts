import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import fs from 'fs'
import Logger from './core/logger'
import { IConfig } from './types/interfaces'
import Moderation from './skills/moderation'
import Post from './skills/post'

Logger.sys('bot starting...')
Logger.sys('telegram token', process.env.TELEGRAM)
Logger.sys('channel', process.env.CHANNEL)
Logger.sys('chat', process.env.CHAT)
if (process.env.DEBUG) {
  Logger.sys('debug mode enabled')
}

const Config = JSON.parse(fs.readFileSync('./bot-config-default.json', 'utf-8')) as IConfig
Logger.sys('config', `config loaded`)

if (process.env.ADMINS) {
  let extraAdmins: number[] = []
  extraAdmins = JSON.parse(process.env.ADMINS)
  Config.admins = extraAdmins
  Logger.sys('config', `extra admins added ${extraAdmins.join(', ')}`)
}

const bot = new TelegramBot(process.env.TELEGRAM, { polling: true })
const moderation = new Moderation(bot, Config, Logger, Number(process.env.CHAT), process.env.TELEGRAM)
const post = new Post(bot, Config, Logger, Number(process.env.CHAT), Number(process.env.CHANNEL))

bot.on('polling_error', (err) => {
  Logger.err('polling', err)
})

bot.on('message', (ctx) => {
  moderation.input(ctx)
  post.input(ctx)
})

bot.on('callback_query', (ctx) => {
  post.callback(ctx)
})

bot.on('channel_post', (ctx) => {
  if (ctx.sender_chat.id == Number(process.env.CHANNEL)) {
    moderation.post(ctx)
  }
})
