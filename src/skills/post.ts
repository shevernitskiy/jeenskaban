import TelegramBot from 'node-telegram-bot-api'
import { ILogger, IConfig } from '../types/interfaces'
import { UserId, ChatId } from '../types/types'
import { Keyboard, Key } from 'telegram-keyboard'

enum State {
  'STANBY',
  'WAIT_MESSAGE',
  'WAIT',
  'WAIT_BUTTON_TITLE',
  'WAIT_BUTTON_URL',
}

export default class Post {
  private readonly _tag = 'post'
  private _admins: UserId[]
  private _state = State.STANBY
  private msg = {
    photo: '',
    text: '',
    button: [],
  }

  private messageToDelete = ''
  private buttonTitle = ''
  private activeUser = 0

  constructor(
    private readonly _bot: TelegramBot,
    private readonly _config: IConfig,
    private readonly _log: ILogger,
    private readonly _chatId: ChatId,
    private readonly _channelId: ChatId,
  ) {
    this.init()
  }

  async init(): Promise<void> {
    this._admins = await this.loadAdmins(this._chatId, this._config.admins)
  }

  async input(ctx: TelegramBot.Message): Promise<void> {
    if (process.env.DEBUG) {
      console.log(ctx)
    }

    if (ctx.text === undefined || ctx.text == '') {
      ctx.text = ''
    }

    if (!this.isAdmin(ctx.from.id) && !this.isAdmin(ctx.from.username) && ctx.from.id != ctx.chat.id) {
      return
    }

    if (this._state == State.WAIT_MESSAGE) {
      this._state = State.STANBY
      if (ctx.photo !== undefined) {
        this.msg.photo = ctx.photo[0].file_id
      }
      if (ctx.text !== undefined && ctx.text !== '') {
        this.msg.text = ctx.text
      }
      if (ctx.caption !== undefined && ctx.caption !== '') {
        this.msg.text = ctx.caption
      }

      this._state = State.WAIT
      this._bot.sendMessage(ctx.from.id, 'ага, сообщения принял, что дальше?', this.optionsKeyboard().inline()).then((r) => {
        this.messageToDelete = `${ctx.from.id}:${r.message_id}`
      })
    }

    if (this._state == State.WAIT_BUTTON_URL) {
      if ((ctx.text.startsWith('https://') || ctx.text.startsWith('http://')) && ctx.text.split('.').length > 1) {
        this._state = State.WAIT

        this.msg.button.push([this.buttonTitle, ctx.text])
        this.buttonTitle = ''

        this._bot.sendMessage(ctx.from.id, 'ага, кнопку принял, что дальше?', this.optionsKeyboard().inline()).then((r) => {
          this.messageToDelete = `${ctx.from.id}:${r.message_id}`
        })
      } else {
        this._bot.sendMessage(ctx.from.id, 'невалидная ссылка, введите нормально')
      }
    }

    if (this._state == State.WAIT_BUTTON_TITLE) {
      this._state = State.WAIT_BUTTON_URL
      this.buttonTitle = ctx.text
      this._bot.sendMessage(ctx.from.id, 'ссылка кнопки?')
    }

    if (ctx.text.startsWith('/post') && this._state == State.STANBY) {
      this.activeUser = ctx.chat.id
      this._state = State.WAIT_MESSAGE
      this._bot.sendMessage(ctx.from.id, 'пришлите пост')
    }
  }

  async callback(ctx: TelegramBot.CallbackQuery): Promise<void> {
    if (process.env.DEBUG) {
      console.log(ctx)
    }

    if (ctx.data == 'addbutton' && this._state == State.WAIT) {
      this._state = State.WAIT_BUTTON_TITLE
      this._bot.sendMessage(ctx.from.id, 'название кнопки?')
    }

    if (ctx.data == 'showresult' && this._state == State.WAIT) {
      this.sendMsg(this.activeUser)
      this._bot.sendMessage(ctx.from.id, 'ага, посмотрели, что дальше?', this.optionsKeyboard().inline()).then((r) => {
        this.messageToDelete = `${ctx.from.id}:${r.message_id}`
      })
    }

    if (ctx.data == 'postit' && this._state == State.WAIT) {
      this._log.log(this._tag, `post to channel ${this._channelId}`)
      this.sendMsg(this._channelId)
      this.resetMsg()
      this.buttonTitle = ''
      this._bot.sendMessage(this.activeUser, 'улетело!')
      this.activeUser = 0
      this._state = State.STANBY
    }

    if (ctx.data == 'cancel' && this._state == State.WAIT) {
      this.resetMsg()
      this.buttonTitle = ''
      this._bot.sendMessage(this.activeUser, 'отменено')
      this.activeUser = 0
      this._state = State.STANBY
    }

    if (this.messageToDelete != '') {
      this._bot.deleteMessage(this.messageToDelete.split(':')[0], this.messageToDelete.split(':')[1])
      this.messageToDelete = ''
    }
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

  async sendMsg(chatId: ChatId): Promise<void> {
    let opts = {}

    if (this.msg.button.length > 0) {
      const keyboard = []
      this.msg.button.forEach((item) => {
        keyboard.push([Key.url(item[0], item[1])])
      })

      opts = Keyboard.make(keyboard).inline()
    }

    try {
      if (this.msg.photo !== undefined && this.msg.photo != '') {
        this._bot.sendPhoto(chatId, this.msg.photo, { ...opts, caption: this.msg.text })
      } else {
        this._bot.sendMessage(chatId, this.msg.text, opts)
      }
    } catch (err) {
      this._log.err(err)
    }
  }

  resetMsg(): void {
    this.msg = {
      photo: '',
      text: '',
      button: [],
    }
  }

  optionsKeyboard(): Keyboard {
    return Keyboard.make([
      [Key.callback('🔗добавить кнопку', 'addbutton'), Key.callback('👀предпросмотр', 'showresult')],
      [Key.callback('✅запостить', 'postit'), Key.callback('⛔️отменить', 'cancel')],
    ])
  }

  isAdmin(userId: UserId): boolean {
    return this._admins.includes(userId)
  }
}
