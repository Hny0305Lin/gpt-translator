export class APIError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly suggestion: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const API_ERRORS = {
  400: {
    message: '请求体格式错误',
    suggestion: '请检查请求参数格式是否正确',
  },
  401: {
    message: 'API key 错误，认证失败',
    suggestion: '请检查您的 API key 是否正确，如没有 API key，请先创建一个',
  },
  402: {
    message: '账号余额不足',
    suggestion: '请确认账户余额并进行充值',
  },
  422: {
    message: '请求体参数错误',
    suggestion: '请检查请求参数是否符合要求',
  },
  429: {
    message: '请求速率（TPM 或 RPM）达到上限',
    suggestion: '请降低请求频率或增加并发间隔',
  },
  500: {
    message: '服务器内部故障',
    suggestion: '请稍后重试，如果问题持续存在请联系支持',
  },
  503: {
    message: '服务器负载过高',
    suggestion: '请稍后重试您的请求',
  },
} as const;

export const FILE_ERRORS = {
  NOT_FOUND: {
    message: '文件不存在',
    suggestion: '请检查文件路径是否正确',
  },
  NO_PERMISSION: {
    message: '无权限访问文件',
    suggestion: '请检查文件权限设置',
  },
  EMPTY_FILE: {
    message: '文件为空',
    suggestion: '请检查文件内容或使用 --ignore-empty 选项忽略空文件',
  },
  UNSUPPORTED_TYPE: {
    message: '不支持的文件类型',
    suggestion: '请检查文件扩展名是否在支持列表中',
  },
  WRITE_ERROR: {
    message: '写入文件失败',
    suggestion: '请检查输出目录权限和磁盘空间',
  },
} as const;

export const LANGUAGE_ERRORS = {
  DETECTION_FAILED: {
    message: '语言检测失败',
    suggestion: '请手动指定源语言或检查文件内容',
  },
  UNSUPPORTED_LANGUAGE: {
    message: '不支持的语言',
    suggestion: '请使用支持的语言代码，可以使用 --list-languages 查看支持的语言',
  },
  INVALID_LANGUAGE_PAIR: {
    message: '无效的语言对',
    suggestion: '请使用正确的语言对格式，例如：zh-en、en-ja',
  },
} as const;

export function isRetryableError(error: any): boolean {
  if (error instanceof APIError) {
    // 429 (速率限制)、500 (服务器错误)、503 (服务器繁忙) 可以重试
    return [429, 500, 503].includes(error.code);
  }
  // 网络错误也可以重试
  return error.code === 'ECONNRESET' ||
         error.code === 'ETIMEDOUT' ||
         error.code === 'ECONNREFUSED';
}

export function handleAPIError(error: any): APIError {
  if (error.response) {
    const statusCode = error.response.status;
    const errorInfo = API_ERRORS[statusCode as keyof typeof API_ERRORS];

    if (errorInfo) {
      return new APIError(
        errorInfo.message,
        statusCode,
        errorInfo.suggestion
      );
    }
  }

  // 处理网络错误
  if (error.code === 'ECONNRESET') {
    return new APIError(
      '连接被重置',
      -1,
      '请检查网络连接并重试'
    );
  }

  if (error.code === 'ETIMEDOUT') {
    return new APIError(
      '请求超时',
      -1,
      '请检查网络连接并重试'
    );
  }

  if (error.code === 'ECONNREFUSED') {
    return new APIError(
      '连接被拒绝',
      -1,
      '请检查 API 地址是否正确'
    );
  }

  // 处理文件操作错误
  if (error.code === 'ENOENT') {
    return new APIError(
      FILE_ERRORS.NOT_FOUND.message,
      -1,
      FILE_ERRORS.NOT_FOUND.suggestion
    );
  }

  if (error.code === 'EACCES') {
    return new APIError(
      FILE_ERRORS.NO_PERMISSION.message,
      -1,
      FILE_ERRORS.NO_PERMISSION.suggestion
    );
  }

  // 未知错误
  return new APIError(
    error.message || '未知错误',
    -1,
    '请检查日志并联系支持'
  );
}
