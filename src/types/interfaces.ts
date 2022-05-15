export interface ILogger {
  log(title: string, value?: string | number): void
  sys(title: string, value?: string | number): void
  err(title: string, value?: string | number | Error): void
}

export interface IConfig {
  rules: string
  commands: {
    user: TelegramCommand[]
    admin: TelegramCommand[]
  }
  admins: number[]
}

interface TelegramCommand {
  command: string
  description: string
}
