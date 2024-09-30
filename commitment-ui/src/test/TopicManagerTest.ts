import * as React from 'react';
import { TopicManager } from '../TopicManager';
import { publishCommitment } from '../utils/publishCommitment';
import CommitmentForm from '../components/CommitmentForm';
import { PrivateKey, PublicKey, Hash } from '@bsv/sdk';
import crypto from 'crypto';
import { render, fireEvent, screen } from '@testing-library/react';
import fetchMock from 'jest-fetch-mock';
import supertest from 'supertest';

// Mock fetch for publishCommitment tests
fetchMock.enableMocks();

// Constants and mock data for testing
const UHRP_PROTOCOL_ADDRESS = '1UHRPYnMHPuQ5Tgb3AF8JXqwKkmZVy5hG';
const VALID_HASH = crypto.createHash('sha256').update('some valid input').digest('hex');
const VALID_URL = 'https://valid.url';
const VALID_TIMESTAMP = Math.floor(Date.now() / 1000) + 1000;
const VALID_FILE_SIZE = '1024';
const privateKeyHex = 'bf4d159ac007184e0d458b7d6e3deb0e645269f55f13ba10f24e654ffc194daa';
const privateKey = PrivateKey.fromString(privateKeyHex, 'hex');
const pubKey = PublicKey.fromPrivateKey(privateKey);

const signCommitment = (fields: (string | Buffer)[]): Buffer => {
  const message = Buffer.concat(fields.map(field => (typeof field === 'string' ? Buffer.from(field, 'utf8') : field)));
  const sha256Message = Hash.sha256(Array.from(message));
  const signature = privateKey.sign(sha256Message);
  return Buffer.from(signature.toDER());
};

// Helper function to generate mock outputScript
const createOutputScript = (fields: (string | Buffer)[]): Buffer => {
  return Buffer.concat(fields.map(field => {
    const fieldBuffer = typeof field === 'string' ? Buffer.from(field, 'utf8') : field;
    return Buffer.concat([Buffer.from([fieldBuffer.length]), fieldBuffer]);
  }));
};

// Test cases for Topic Manager commitment validation
describe('Topic Manager Commitment Validation', () => {
  let VALID_SIGNATURE_BUFFER: Buffer;

  beforeAll(() => {
    const fields = [
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      Buffer.from(VALID_HASH, 'hex'),
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE
    ];
    VALID_SIGNATURE_BUFFER = signCommitment(fields);
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
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(validOutputScript, pubKey);
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

  it('should reject an expired timestamp', () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 1000; // Past timestamp
    const expiredOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      Buffer.from(VALID_HASH, 'hex'),
      'advertise',
      VALID_URL,
      expiredTimestamp.toString(),
      VALID_FILE_SIZE,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(expiredOutputScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an invalid file size', () => {
    const invalidFileSize = '0'; // Invalid file size (0 bytes)
    const invalidOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      Buffer.from(VALID_HASH, 'hex'),
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      invalidFileSize,
      VALID_SIGNATURE_BUFFER
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidOutputScript, pubKey);
    expect(isValid).toBe(false);
  });

  it('should reject an invalid signature', () => {
    const invalidSignatureBuffer = Buffer.from('invalidsignature');
    const invalidOutputScript = createOutputScript([
      UHRP_PROTOCOL_ADDRESS,
      pubKey.toString(),
      Buffer.from(VALID_HASH, 'hex'),
      'advertise',
      VALID_URL,
      VALID_TIMESTAMP.toString(),
      VALID_FILE_SIZE,
      invalidSignatureBuffer
    ]);

    const isValid = TopicManager.evaluateCommitment(invalidOutputScript, pubKey);
    expect(isValid).toBe(false);
  });
});

describe('publishCommitment', () => {
  beforeAll(() => {
    jest.setTimeout(15000); // Increase timeout to 15 seconds for longer tests
  });

  beforeEach(() => {
    fetchMock.resetMocks(); // Reset the mocks before each test
  });

  it('should successfully publish a commitment and return a valid UHRP URL', async () => {
    // Mock a successful response with a placeholder valid URL
    fetchMock.mockResponseOnce(JSON.stringify({ uhrpURL: 'https://example-uhrp-url.com/commitment' }));

    const result = await publishCommitment({
      url: 'https://drive.google.com/file/d/1HVzNnYK5AI7-lG-W-WY7Tfu6watSKVsc/view?usp=sharing', // Use the actual file URL
      hostingMinutes: 1440, // Hosting time in minutes
      address: '1RealUHRPAddress123', // Replace with a dynamically validated address
      serviceURL: 'https://staging-overlay.babbage.systems', // Actual service URL
    });

    // Validate that the returned result is a valid URL format
    expect(result).toMatch(/^https?:\/\/.+/);
    // Ensure that the fetch was called with the correct submission endpoint and parameters
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging-overlay.babbage.systems/submit',
      expect.any(Object)
    );
  }, 10000); // Timeout of 10 seconds for this test

  it('should handle long-running requests by increasing timeout', async () => {
    jest.setTimeout(10000); // Increase timeout to 10 seconds for longer requests

    // Mock a delayed response (7 seconds) to simulate a long-running request
    fetchMock.mockResponseOnce(async () => {
      return new Promise(resolve =>
        setTimeout(
          () => resolve({ body: JSON.stringify({ uhrpURL: 'https://example-uhrp-url.com/commitment' }) }),
          7000
        )
      );
    });

    const result = await publishCommitment({
      url: 'https://drive.google.com/file/d/1HVzNnYK5AI7-lG-W-WY7Tfu6watSKVsc/view?usp=sharing', // Use the actual file URL
      hostingMinutes: 1440, // Hosting time in minutes
      address: '1RealUHRPAddress123', // Replace with dynamically validated address
      serviceURL: 'https://staging-overlay.babbage.systems', // Actual service URL
    });

    // Validate that the returned result is a valid URL format
    expect(result).toMatch(/^https?:\/\/.+/);
  }, 10000); // Timeout of 10 seconds for this test
});


// Test cases for Overlay Service interaction using BEEF
describe('Overlay Service Tests', () => {
  const request = supertest('https://staging-overlay.babbage.systems');

  it('should submit valid storage commitment using BEEF format', async () => {
    const hostingMinutes = 1440;
    const transactionData = Buffer.concat([
      Buffer.from(VALID_URL, 'utf8'),
      Buffer.from(hostingMinutes.toString(), 'utf8'),
      Buffer.from(pubKey.toString(), 'utf8'),
    ]);

    const response = await request
      .post('/submit')
      .set('Content-Type', 'application/octet-stream')
      .set('X-Topics', JSON.stringify(['tm_uhrp']))
      .send(transactionData);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('uhrpURL');
  });
});
