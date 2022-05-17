import { ILogger } from '../types/interfaces'

class Logger implements ILogger {
  log = (title: string, value?: string | number): void => {
    console.info(`💡 ${title}${value ? ` › ${value}` : ''}`)
  }
  sys = (title: string, value?: string | number): void => {
    console.info(`🤖 ${title}${value ? ` › ${value}` : ''}`)
  }
  err = (title: string, value?: string | number | Error): void => {
    console.info(`🔴 ${title}${value ? ` › ${value}` : ''}`)
  }
}

export default new Logger()
