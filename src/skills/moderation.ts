import TelegramBot from 'node-telegram-bot-api'
import axios from 'axios'
import moment from 'moment'
import { ILogger, IConfig } from '../types/interfaces'
import { UserId, ChatId, MessageId } from '../types/types'

export default class Moderation {
  private readonly _tag = 'moderation'
  private _permissions: TelegramBot.ChatPermissions
  private _admins: UserId[]

  constructor(
    private readonly _bot: TelegramBot,
    private readonly _config: IConfig,
    private readonly _log: ILogger,
    private readonly _chatId: ChatId,
    private readonly _token: string,
  ) {
    this.init()
  }

  async init(): Promise<void> {
    this._admins = await this.loadAdmins(this._chatId, this._config.admins)
    this._permissions = await this.loadPermissions(this._chatId)

    await this.setCommands(this._token, this._chatId, 'chat_administrators', this._config.commands.admin)
    await this.setCommands(this._token, this._chatId, 'chat', this._config.commands.user)
  }

  async input(ctx: TelegramBot.Message): Promise<void> {
    if (process.env.DEBUG) {
      console.log(ctx)
    }

    try {
      const options = { parse_mode: 'Markdown' } as TelegramBot.SendMessageOptions
      if (ctx.reply_to_message?.message_id) {
        options.reply_to_message_id = ctx.reply_to_message.message_id
      }

      if (ctx.text == undefined) {
        ctx.text = ''
      }

      /* ---------------------------- Rules on new post --------------------------- */

      if (
        ctx.from.id == 777000 &&
        ctx.from.first_name == 'Telegram' &&
        ctx.is_automatic_forward == true &&
        (ctx.caption?.length > 0 || ctx.text?.length > 0)
      ) {
        if (this._config.rules?.length > 0) {
          this._bot.sendMessage(ctx.chat.id, this._config.rules, { reply_to_message_id: ctx.message_id, parse_mode: 'Markdown' })
        }
      }

      /* ------------------------------ User commands ----------------------------- */

      if (ctx.text.startsWith('/rules')) {
        if (this._config.rules?.length > 0) {
          this._bot.sendMessage(ctx.chat.id, this._config.rules, { reply_to_message_id: ctx.message_id, parse_mode: 'HTML' })
        }
      }

      if (!this.isAdmin(ctx.from.id) && !this.isAdmin(ctx.from.username)) {
        return
      }

      /* ------------------------------- Admin only ------------------------------- */

      if (ctx.text.startsWith('/usercommands')) {
        const members = await this.getCommands(this._token, this._chatId, 'chat')
        const admins = await this.getCommands(this._token, this._chatId, 'chat_administrators')

        this._bot.sendMessage(ctx.chat.id, [...members, '', ...admins].join('\n'), { ...options, parse_mode: 'HTML' })
      }

      if (ctx.text.startsWith('/reload')) {
        this.loadAdmins(this._chatId, this._config.admins).then((res) => {
          this._admins = res
          this._bot.sendMessage(ctx.chat.id, `Админы: ${this._admins.join(', ')}`, options)
        })
        this.loadPermissions(this._chatId).then((res) => {
          this._permissions = res
          this._bot.sendMessage(ctx.chat.id, `Разрешения по-умолчанию: ${JSON.stringify(this._permissions)}`, {
            ...options,
            parse_mode: 'HTML',
          })
        })
      }

      if (ctx.text.startsWith('/ban') && ctx.reply_to_message != undefined) {
        const reason = ctx.text.split(' ')

        this.ban(ctx.reply_to_message.from.id, ctx.chat.id, ctx.message_id).then((result) => {
          if (result) {
            this._bot.sendMessage(
              ctx.chat.id,
              [
                `🔨 [${this.parseReadableName(ctx)}](tg://user?id=${ctx.reply_to_message.from.id}) забанен`,
                `${reason.length > 1 ? 'Причина: ' + ctx.text.replace(reason[0], '').trim() : 'Без причины'}`,
              ].join('\n'),
              options,
            )
          } else {
            this._bot.sendMessage(ctx.chat.id, `Что-то пошло не так`, options)
          }
        })
      }

      if (ctx.text.startsWith('/mute') && ctx.reply_to_message != undefined) {
        const reason = ctx.text.split(' ')
        reason.shift()
        let until = 0

        if (reason.length > 0) {
          const match = reason[0]?.match(/([0-9]*д|[0-9]*ч|[0-9]*м)/gm)
          if (match !== null && match?.length > 0) {
            until = this.until(match as string[]).unix()
            reason.shift()
          }
        }

        this.mute(ctx.reply_to_message.from.id, ctx.chat.id, ctx.message_id, until).then((result) => {
          if (result) {
            this._bot.sendMessage(
              ctx.reply_to_message.chat.id,
              [
                `🤐 [${this.parseReadableName(ctx)}](tg://user?id=${ctx.reply_to_message.from.id}) замьючен`,
                `${reason.length > 0 ? `Причина: ${reason.join(' ').trim()}` : 'Без причины'}`,
                `${until > moment().unix() ? `На: ${ctx.text.split(' ')[1]}` : 'Навсегда'}`,
              ].join('\n'),
              options,
            )
          } else {
            this._bot.sendMessage(ctx.chat.id, `Что-то пошло не так`, options)
          }
        })
      }

      if (ctx.text.startsWith('/unban') && ctx.reply_to_message != undefined) {
        this.unban(ctx.reply_to_message.from.id, ctx.chat.id, ctx.message_id).then((result) => {
          if (result) {
            this._bot.sendMessage(
              ctx.reply_to_message.chat.id,
              [`🛡️ [${this.parseReadableName(ctx)}](tg://user?id=${ctx.reply_to_message.from.id}) разбанен`].join('\n'),
              options,
            )
          } else {
            this._bot.sendMessage(ctx.chat.id, `Что-то пошло не так`, options)
          }
        })
      }

      if (ctx.text.startsWith('/unmute') && ctx.reply_to_message != undefined) {
        this.unmute(ctx.reply_to_message.from.id, ctx.chat.id, ctx.message_id, this._permissions).then((result) => {
          if (result) {
            this._bot.sendMessage(
              ctx.reply_to_message.chat.id,
              [`🛡️ [${this.parseReadableName(ctx)}](tg://user?id=${ctx.reply_to_message.from.id}) размьючен`].join('\n'),
              options,
            )
          } else {
            this._bot.sendMessage(ctx.chat.id, `Что-то пошло не так`, options)
          }
        })
      }
    } catch (err) {
      this._log.err(err)
    }
  }

  post(ctx: TelegramBot.Message): void {
    if (process.env.DEBUG) {
      console.log(ctx)
    }
  }

  isUser(user: TelegramBot.User): boolean {
    return user.id != 777000 && user.is_bot != true
  }

  isAdmin(userId: UserId): boolean {
    return this._admins.includes(userId)
  }

  isPrivate(ctx: TelegramBot.Message): boolean {
    return ctx.from.id == ctx.chat.id
  }

  until(match: string[]): moment.Moment {
    const date = moment()

    match.forEach((item) => {
      if (item.includes('д')) {
        date.add(Number(item.replace('д', '')), 'd')
      }
      if (item.includes('ч')) {
        date.add(Number(item.replace('ч', '')), 'h')
      }
      if (item.includes('м')) {
        date.add(Number(item.replace('м', '')), 'm')
      }
    })

    return date
  }

  parseReadableName(ctx: TelegramBot.Message): string {
    return ctx.reply_to_message?.from.first_name && ctx.reply_to_message?.from.last_name
      ? ctx.reply_to_message?.from.first_name + ' ' + ctx.reply_to_message?.from.last_name
      : false ||
          ctx.reply_to_message?.from.first_name ||
          ctx.reply_to_message?.from.last_name ||
          ctx.reply_to_message?.from.username ||
          String(ctx.reply_to_message?.from.id)
  }

  async mute(userId: UserId, chatId: ChatId, clearId?: MessageId, until = 0): Promise<boolean> {
    this._log.log(this._tag, `mute user ${userId} in ${chatId}`)

    if (clearId != undefined) {
      this._bot.deleteMessage(chatId, String(clearId))
    }

    return this._bot.restrictChatMember(chatId, String(userId), {
      can_add_web_page_previews: false,
      can_invite_users: false,
      can_send_media_messages: false,
      can_send_messages: false,
      can_change_info: false,
      can_pin_messages: false,
      can_send_other_messages: false,
      can_send_polls: false,
      until_date: until,
    })
  }

  async unmute(userId: UserId, chatId: ChatId, clearId?: MessageId, permissions?: TelegramBot.ChatPermissions): Promise<boolean> {
    this._log.log(this._tag, `unmute user ${userId} in ${chatId}`)

    if (clearId != undefined) {
      this._bot.deleteMessage(chatId, String(clearId))
    }

    let opts: TelegramBot.ChatPermissions = {}
    if (permissions) {
      opts = permissions
    } else {
      opts = {
        can_add_web_page_previews: true,
        can_invite_users: true,
        can_send_media_messages: true,
        can_send_messages: true,
        can_change_info: true,
        can_pin_messages: true,
        can_send_other_messages: true,
        can_send_polls: true,
      }
    }

    return this._bot.restrictChatMember(chatId, String(userId), opts)
  }

  async unban(userId: UserId, chatId: ChatId, clearId?: MessageId): Promise<boolean> {
    this._log.log(this._tag, `unban user ${userId} in ${chatId}`)

    if (clearId != undefined) {
      this._bot.deleteMessage(chatId, String(clearId))
    }

    return this._bot.unbanChatSenderChat(chatId, String(userId))
  }

  async ban(userId: UserId, chatId: ChatId, clearId?: MessageId): Promise<boolean> {
    this._log.log(this._tag, `ban user ${userId} in ${chatId}`)

    if (clearId != undefined) {
      this._bot.deleteMessage(chatId, String(clearId))
    }

    return this._bot.banChatSenderChat(chatId, String(userId))
  }

  async loadAdmins(chatId: ChatId, extra: UserId[] = []): Promise<UserId[]> {
    this._log.log(this._tag, `load admins from chat ${chatId}`)

    return this._bot.getChatAdministrators(chatId).then((res) => {
      const out: UserId[] = []

      res.forEach((item) => {
        out.push(item.user.id)
      })

      return [...out, ...extra]
    })
  }

  async loadPermissions(chatId: ChatId): Promise<TelegramBot.ChatPermissions> {
    this._log.log(this._tag, `load chat permissions from chat ${chatId}`)

    return this._bot.getChat(chatId).then(({ permissions }) => {
      return permissions
    })
  }

  async getCommands(token: string, chatId: ChatId, type: 'chat' | 'chat_administrators'): Promise<string[]> {
    return axios
      .post(`https://api.telegram.org/bot${token}/getMyCommands`, {
        scope: {
          type: type,
          chat_id: chatId,
        },
      })
      .then(({ data }) => {
        const out = [`Скоуп: <b>${type}</b> | <b>${chatId}</b>`]

        data.result.forEach((item) => {
          out.push(`/<b>${item.command}</b> - ${item.description}`)
        })

        return out
      })
      .catch((err) => {
        this._log.err(this._tag, err)

        return [`ошибонька`]
      })
  }

  async setCommands(
    token: string,
    chatId: ChatId,
    type: 'chat' | 'chat_administrators',
    commands: TelegramBot.BotCommand[],
  ): Promise<boolean> {
    return axios
      .post(`https://api.telegram.org/bot${token}/setMyCommands`, {
        scope: {
          type: type,
          chat_id: chatId,
        },
        commands: commands,
      })
      .then(({ data }) => {
        if (data.ok) {
          this._log.log(this._tag, `commands for ${type}|${chatId} setted`)
        } else {
          this._log.err(this._tag, `unable  to set commands for ${type}|${chatId}`)
        }

        return data.ok
      })
      .catch((err) => {
        this._log.err(this._tag, err)
      })
  }
}
