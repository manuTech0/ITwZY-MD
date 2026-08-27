# Whats is?

This project creating auth service, otp service, etc for connect to whastapp. This use BullMQ over Redis as message queue, not REST API or dependencies. For sent message to other people in whatsapp you can enqueue a job to the `message-send` queue or you can take message from other people by consuming the `message-upsert` queue

# Feature
- Idempotency by default
- Deduplicate by default
- FIFO (1 message can sending)
- Documentation event by asyncapi
- Multi Worker
- Multiple device or node be able to connect

# Configuration

## configs/app.yaml
Before write your configutation, you just to rename app.yml.bak to app.yml

```bash
mv configs/app.yml.bak configs/app.yml
```


| Name          | Description                                                                  |
|---------------|------------------------------------------------------------------------------|
| `wanumber`   | If PAIRING_CODE is true, you just write account number for take pairing code |
|---------------|------------------------------------------------------------------------------|
| `adminnumber` | Whatsapp account number for call command status                              |

## .env

Before write your secret configutation, you just to rename .env.example to .env

```bash
mv .env.example .env
```
| Name           | Description                                                                                                            |
|----------------|------------------------------------------------------------------------------------------------------------------------|
| `PAIRING_CODE` | Mode for connect whatsapp to tools, false for qrcode mode or true for pairing code mode                                |
| `REDIS_URL`    | Redis credentials for cache data                                                                                       |
| `STATE_TYPE`   | For whatsapp sessions can save. This can 2 mode, `db` sessions stored in database and `file` sessions stored in folder |
| `DATABASE_URL` | If STATE_TYPE is `db`, fill this in database credentials                                                               |
| `STATE_PATH`   | If STATE_TYPE is `file`, fill this in path directory you can save sessions, relative with source code                  |


