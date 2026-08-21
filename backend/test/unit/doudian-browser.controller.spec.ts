import { BadRequestException } from '@nestjs/common'
import { DoudianBrowserController } from '../../src/modules/doudian-browser/doudian-browser.controller'

describe('DoudianBrowserController', () => {
  function createController() {
    const service = {
      getSummary: jest.fn().mockResolvedValue({ ok: true }),
    }
    return {
      controller: new DoudianBrowserController(service as any),
      service,
    }
  }

  it('passes valid summary ranges to the service', async () => {
    const { controller, service } = createController()

    await controller.getSummary('store-1', '100', '200', 'today')

    expect(service.getSummary).toHaveBeenCalledWith('store-1', 100, 200, 'today')
  })

  it('rejects malformed summary ranges before they reach the service', () => {
    const { controller, service } = createController()

    expect(() => controller.getSummary('store-1', 'abc', '200', 'today')).toThrow(
      BadRequestException,
    )
    expect(() => controller.getSummary('store-1', '200', '100', 'today')).toThrow(
      BadRequestException,
    )
    expect(service.getSummary).not.toHaveBeenCalled()
  })
})
