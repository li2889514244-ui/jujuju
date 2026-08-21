import { NotImplementedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BrowserService } from '../../src/modules/browser/browser.service';

describe('BrowserService', () => {
  let service: BrowserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrowserService],
    }).compile();

    service = module.get<BrowserService>(BrowserService);
  });

  it('keeps the disabled browser engine explicit for instance listing', () => {
    expect(() => service.getInstances()).toThrow(NotImplementedException);
  });

  it('rejects instance creation while the backend browser engine is disabled', async () => {
    await expect(service.createInstance('acc-001')).rejects.toThrow(NotImplementedException);
  });

  it('rejects instance cleanup while the backend browser engine is disabled', async () => {
    await expect(service.closeInstance('browser-001')).rejects.toThrow(NotImplementedException);
  });

  it('rejects cookie injection while the backend browser engine is disabled', async () => {
    await expect(service.setCookies('browser-001', 'session=abc')).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('rejects publishing while the backend browser engine is disabled', async () => {
    await expect(service.executePublish('browser-001', 'douyin', { title: 'test' })).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('rejects screenshots while the backend browser engine is disabled', async () => {
    await expect(service.screenshot('browser-001')).rejects.toThrow(NotImplementedException);
  });
});
