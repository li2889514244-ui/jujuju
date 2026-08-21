import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateAccountDto } from '../../src/modules/accounts/dto/update-account.dto'

describe('UpdateAccountDto normalization', () => {
  it('normalizes object nickname and avatar before validation', async () => {
    const dto = plainToInstance(UpdateAccountDto, {
      nickname: { name: 'Updated Nick' },
      avatar: { url: 'https://example.com/avatar.png' },
    })

    const errors = await validate(dto)

    expect(errors).toHaveLength(0)
    expect(dto.nickname).toBe('Updated Nick')
    expect(dto.avatar).toBe('https://example.com/avatar.png')
  })
})
