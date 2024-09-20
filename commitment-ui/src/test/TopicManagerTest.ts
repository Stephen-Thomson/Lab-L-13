import { TopicManager } from '../TopicManager';
import { PublicKey, PrivateKey, Hash, Signature } from '@bsv/sdk';
import crypto from 'crypto';
import supertest from 'supertest';

// Constants and mock data for testing
const UHRP_PROTOCOL_ADDRESS = '1UHRPYnMHPuQ5Tgb3AF8JXqwKkmZVy5hG';
const VALID_HASH = crypto.createHash('sha256').update('some valid input').digest('hex'); // Generate valid SHA-256 hash
const INVALID_HASH = 'invalidhash';
const VALID_URL = 'https://valid.url';
const INVALID_URL = 'invalid-url';
const VALID_TIMESTAMP = Math.floor(Date.now() / 1000) + 1000; // Future timestamp
const EXPIRED_TIMESTAMP = Math.floor(Date.now() / 1000) - 1000; // Expired timestamp
const VALID_FILE_SIZE = '1024';
const INVALID_FILE_SIZE = '-1';

// Private Key for signing (from Ninja Wallet)
const privateKeyHex = 'bf4d159ac007184e0d458b7d6e3deb0e645269f55f13ba10f24e654ffc194daa';
const privateKey = PrivateKey.fromString(privateKeyHex, 'hex');
const pubKey = PublicKey.fromPrivateKey(privateKey); // Derive public key from private key

// Function to generate a valid signature for the commitment
const signCommitment = (fields: (string | Buffer)[]): Buffer => {
    // Concatenate all the fields to create the message to sign
    const message = Buffer.concat(fields.map(field => (typeof field === 'string' ? Buffer.from(field, 'utf8') : field)));
  
    // Hash the message
    const sha256Message = Hash.sha256(Array.from(message));
  
    // Sign the hashed message
    const signature = privateKey.sign(sha256Message);
  
    // Convert the signature to a Buffer and return it
    return Buffer.from(signature.toDER());
};

// Helper function to generate mock outputScript
const createOutputScript = (fields: (string | Buffer)[]): Buffer => {
  return Buffer.concat(fields.map((field) => {
    const fieldBuffer = typeof field === 'string' ? Buffer.from(field, 'utf8') : field;
    return Buffer.concat([Buffer.from([fieldBuffer.length]), fieldBuffer]);
  }));
};

// Test cases for evaluating storage commitments
describe('Topic Manager Commitment Validation', () => {
  let VALID_SIGNATURE_BUFFER: Buffer;

  beforeAll(() => {
    // Generate the valid signature to use in multiple tests
    const fields = [
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      Buffer.from(VALID_HASH, 'hex'),
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE
    ];
    VALID_SIGNATURE_BUFFER = signCommitment(fields); // Generate the valid signature
  });
  
  it('should admit a valid storage commitment', () => {
    const validOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      Buffer.from(VALID_HASH, 'hex'),
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      signCommitment([
        UHRP_PROTOCOL_ADDRESS,
        pubKey.toString(),
        Buffer.from(VALID_HASH, 'hex'),
        'advertise',
        VALID_URL,
        VALID_TIMESTAMP.toString(),
        VALID_FILE_SIZE
      ])
    ]);
  
    console.log('Calling evaluateCommitment with validOutputScript and pubKey');
  
    const isValid = TopicManager.evaluateCommitment(validOutputScript, pubKey);
  
    console.log('Received result from evaluateCommitment:', isValid);
  
    expect(isValid).toBe(true);
  });

  it('should reject an invalid protocol address', () => {
    const invalidOutputScript = createOutputScript([
      'invalid_protocol',
      pubKey.toString(),
      VALID_HASH,
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidOutputScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an invalid hash', () => {
    const invalidOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      INVALID_HASH,
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidOutputScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an invalid URL', () => {
    const invalidOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      VALID_HASH,
      'advertise',
      INVALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidOutputScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an expired timestamp', () => {
    const expiredOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      VALID_HASH,
      'advertise',
      VALID_URL,
      EXPIRED_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(expiredOutputScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an invalid file size', () => {
    const invalidFileSizeScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      VALID_HASH,
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      INVALID_FILE_SIZE,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidFileSizeScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an invalid signature', () => {
    const INVALID_SIGNATURE_BUFFER = Buffer.from('0000...', 'hex'); // Mock invalid signature

    const invalidSignatureScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      VALID_HASH,
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      INVALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidSignatureScript, pubKey);
    expect(isValid).toBe(false);
  });
});

// Test cases for Overlay Service interaction
describe('Overlay Service Tests', () => {
  const request = supertest('https://staging-overlay.babbage.systems');

  it('should submit valid storage commitment', async () => {
    const response = await request.post('/submit').send({
      url: VALID_URL,
      hostingMinutes: 1440, // 1 day
      address: pubKey.toString(),
      serviceURL: 'https://staging-overlay.babbage.systems',
    });

    console.log('Request:', {
      url: VALID_URL,
      hostingMinutes: 1440,
      address: pubKey.toString(),
      serviceURL: 'https://staging-overlay.babbage.systems',
    });
    console.log('Response Headers:', response.headers);
    console.log('Response Body:', response.body);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('uhrpURL');
  });
});
