interface ILogger {
  log(title: string, value?: string | number): void
  sys(title: string, value?: string | number): void
  err(title: string, value?: string | number | Error): void
}

interface IConfig {
  rules: string
  commands: {
    user: TelegramCommand[]
    admin: TelegramCommand[]
  }
  admins: number[]
}
