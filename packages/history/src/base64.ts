function decodeBase64Bytes(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  return Buffer.from(value, 'base64');
}

export function decodeBase64Utf8(value: string): string {
  return new TextDecoder().decode(decodeBase64Bytes(value));
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function uint8ArrayToBase64(value: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';

    for (const byte of value) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }

  return Buffer.from(value).toString('base64');
}
