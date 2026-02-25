import prisma from '../db';
import { BotInstance } from './BotInstance';

class BotManager {
  private instances: Map<string, BotInstance> = new Map();

  async initialize(): Promise<void> {
    const bots = await prisma.bot.findMany({ where: { isActive: true } });
    for (const bot of bots) {
      await this.startBot(bot.id, bot.token);
    }
    console.log(`BotManager initialized with ${bots.length} bots`);
  }

  async startBot(botId: string, token: string): Promise<BotInstance> {
    if (this.instances.has(botId)) {
      return this.instances.get(botId)!;
    }

    const instance = new BotInstance(token, botId);
    this.instances.set(botId, instance);

    // Start in background (non-blocking)
    instance.start().catch((error) => {
      console.error(`Error starting bot ${botId}:`, error);
      this.instances.delete(botId);
    });

    return instance;
  }

  async stopBot(botId: string): Promise<void> {
    const instance = this.instances.get(botId);
    if (instance) {
      await instance.stop();
      this.instances.delete(botId);
    }
  }

  async restartBot(botId: string, token: string): Promise<void> {
    await this.stopBot(botId);
    await this.startBot(botId, token);
  }

  getInstance(botId: string): BotInstance | undefined {
    return this.instances.get(botId);
  }

  getRunningBotIds(): string[] {
    return Array.from(this.instances.keys());
  }

  async stopAll(): Promise<void> {
    for (const [, instance] of this.instances) {
      await instance.stop();
    }
    this.instances.clear();
  }
}

export const botManager = new BotManager();
