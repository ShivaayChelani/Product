export interface CompressionResult {
  compressedUri: string;
  originalSize: number;
  compressedSize: number;
}

export async function compressVideo(inputUri: string): Promise<CompressionResult> {
  try {
    const Compressor = require('react-native-compressor');
    if (!Compressor?.Video?.compress) {
      return { compressedUri: inputUri, originalSize: 0, compressedSize: 0 };
    }

    const result = await Compressor.Video.compress(inputUri, {
      compressionMethod: 'auto',
      maxSize: 1280,
      bitrate: 2000000,
    });

    return {
      compressedUri: result || inputUri,
      originalSize: 0,
      compressedSize: 0,
    };
  } catch {
    return { compressedUri: inputUri, originalSize: 0, compressedSize: 0 };
  }
}


