import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlayerModule } from './player/player.module';
import { LocationModule } from './location/location.module';
import { NpcModule } from './npc/npc.module';
import { ItemModule } from './item/item.module';
import { BackpackModule } from './backpack/backpack.module';
import { TaskModule } from './task/task.module';
import { MobModule } from './mob/mob.module';
import { TechniqueModule } from './technique/technique.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
    PlayerModule,
    LocationModule,
    NpcModule,
    ItemModule,
    BackpackModule,
    TaskModule,
    MobModule,
    TechniqueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
