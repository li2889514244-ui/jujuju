import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter'

describe('HttpExceptionFilter business errorCode passthrough', () => {
  function makeFilter(production = false) {
    if (production) process.env.NODE_ENV = 'production'
    else delete process.env.NODE_ENV
    return new HttpExceptionFilter()
  }

  function mockResponse() {
    const sent: Record<string, any> = {}
    return {
      json: jest.fn((body: Record<string, any>) => {
        Object.assign(sent, body)
        return body
      }),
      status: jest.fn(function (this: any, code: number) {
        sent.__status = code
        return this
      }),
      sent,
    }
  }

  it('preserves a structured business code as errorCode', () => {
    const filter = makeFilter()
    const response: any = mockResponse()
    filter.catch(
      new HttpException({ code: 'STALE_COMPANION_BINDING', message: '绑定已失效' }, HttpStatus.CONFLICT),
      {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({ url: '/api/v1/doudian-browser/stores/x/upload', method: 'POST' }),
        }),
      } as any,
    )
    expect(response.sent.__status).toBe(409)
    expect(response.sent.errorCode).toBe('STALE_COMPANION_BINDING')
    expect(response.sent.code).toBe(409)
    expect(response.sent.message).toBe('绑定已失效')
  })

  it('omits errorCode for plain string exceptions', () => {
    const filter = makeFilter()
    const response: any = mockResponse()
    filter.catch(new BadRequestException('Doudian store not found'), {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/api/v1/x', method: 'GET' }),
      }),
    } as any)
    expect(response.sent.errorCode).toBeUndefined()
    expect(response.sent.code).toBe(400)
  })
})
