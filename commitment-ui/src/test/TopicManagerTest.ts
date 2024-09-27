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

// Test cases for evaluating storage commitments
// describe('Topic Manager Commitment Validation', () => {
//   let VALID_SIGNATURE_BUFFER: Buffer;

//   beforeAll(() => {
//     const fields = [
//       UHRP_PROTOCOL_ADDRESS,
//       pubKey.toString(),
//       Buffer.from(VALID_HASH, 'hex'),
//       'advertise',
//       VALID_URL,
//       VALID_TIMESTAMP.toString(),
//       VALID_FILE_SIZE
//     ];
//     VALID_SIGNATURE_BUFFER = signCommitment(fields);
//   });

//   it('should admit a valid storage commitment', () => {
//     const validOutputScript = createOutputScript([
//       UHRP_PROTOCOL_ADDRESS,
//       pubKey.toString(),
//       Buffer.from(VALID_HASH, 'hex'),
//       'advertise',
//       VALID_URL,
//       VALID_TIMESTAMP.toString(),
//       VALID_FILE_SIZE,
//       VALID_SIGNATURE_BUFFER
//     ]);

//     const isValid = TopicManager.evaluateCommitment(validOutputScript, pubKey);
//     expect(isValid).toBe(true);
//   });

//   it('should reject an invalid protocol address', () => {
//     const invalidOutputScript = createOutputScript([
//       'invalid_protocol',
//       pubKey.toString(),
//       VALID_HASH,
//       'advertise',
//       VALID_URL,
//       VALID_TIMESTAMP.toString(),
//       VALID_FILE_SIZE,
//       VALID_SIGNATURE_BUFFER
//     ]);

//     const isValid = TopicManager.evaluateCommitment(invalidOutputScript, pubKey);
//     expect(isValid).toBe(false);
//   });
  
//   // Add more tests for invalid cases like invalid hash, URL, expired timestamp, invalid signature, etc.
// });

// Test cases for publishCommitment
describe('publishCommitment', () => {
  beforeAll(() => {
    jest.setTimeout(10000); // Set global timeout for all tests in this file to 10 seconds
  });

  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('should successfully publish a commitment and return a valid UHRP URL', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ uhrpURL: 'https://example.com/commitment' }));

    const result = await publishCommitment({
      url: VALID_URL,
      hostingMinutes: 1440,
      address: '1ExampleAddress123',
      serviceURL: 'https://staging-overlay.babbage.systems',
    });

    expect(result).toEqual('https://example.com/commitment');
    expect(fetchMock).toHaveBeenCalledWith('https://staging-overlay.babbage.systems', expect.any(Object));
  });

  // Handle timeouts by increasing Jest timeout for async operations
  it('should handle long-running requests by increasing timeout', async () => {
    jest.setTimeout(10000); // Set timeout to 10 seconds

    fetchMock.mockResponseOnce(async () => {
      // Simulate a delayed response
      return new Promise(resolve => setTimeout(() => resolve({ body: JSON.stringify({ uhrpURL: 'https://example.com/commitment' }) }), 7000));
    });

    const result = await publishCommitment({
      url: VALID_URL,
      hostingMinutes: 1440,
      address: '1ExampleAddress123',
      serviceURL: 'https://staging-overlay.babbage.systems',
    });

    expect(result).toEqual('https://example.com/commitment');
  });
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
