import { createAction } from '@babbage/sdk-ts';
import { getURLForFile, getHashFromURL } from 'uhrp-url';
import pushdrop from 'pushdrop';
import fetch from 'node-fetch';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid'; // Import uuidv4 to generate unique key IDs

// Define the expected structure of the result
interface UHRPResponse {
  uhrpURL: string; // The UHRP URL returned from the server
}

// 1. Generate a unique key ID for each commitment
const generateUniqueKeyID = () => {
  return uuidv4();
};

/**
 * Publishes a file hosting commitment.
 * @param {string} url - The URL of the file to be committed.
 * @param {number} hostingMinutes - Duration for committing to hosting the file at the given url.
 * @param {string} address - Address associated with the commitment.
 * @param {string} serviceURL - The overlay service URL where the commitment is submitted.
 * @returns {Promise<string>} - The UHRP URL of the published commitment.
 */
export async function publishCommitment({
  url,
  hostingMinutes,
  address,
  serviceURL = 'https://staging-overlay.babbage.systems',
}: {
  url: string;
  hostingMinutes: number;
  address: string;
  serviceURL?: string;
}): Promise<string> {
  try {
    // Step 1: Fetch the file from the provided URL
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch the file');
    const fileBlob = await response.blob();

    // Step 2: Convert the Blob to a Buffer
    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Step 3: Generate a UHRP URL from the file's buffer
    const uhrpURL = getURLForFile(fileBuffer);

    // Step 4: Generate a hash from the UHRP URL
    const hash = getHashFromURL(uhrpURL);

    // Step 5: Calculate the expiry time for the UHRP advertisement
    const expiryTime = Math.floor(Date.now() / 1000) + hostingMinutes * 60; // Convert hostingMinutes to seconds

    // Step 6: Generate unique key ID for the commitment
    const keyID = generateUniqueKeyID();

    // Step 7: Use pushdrop.create() to create the output script
    const outputScript = await pushdrop.create({
      fields: [
        address, // Host address
        hash, // File hash
        'advertise', // Action 'advertise'
        url, // File URL
        expiryTime.toString(), // Expiry time
        fileBuffer.length.toString(), // File size in bytes
      ],
      protocolID: 'file_storage_commitments', // Set the protocol ID for the UHRP token
      keyID, // Use the generated unique key ID
    });

    // Step 8: Use createAction to build the blockchain transaction
    const action = await createAction({
      outputs: [
        {
          satoshis: 1000, // Set appropriate satoshis amount
          script: outputScript, // Use the generated output script from pushdrop.create()
          basket: 'file_storage_commitments', // Name of the basket
          customInstructions: JSON.stringify({
            url,
            hostingMinutes,
            address,
          }), // Custom instructions for file storage commitment
        },
      ],
      description: 'Submitting a new file storage commitment',
    });

    // Step 9: Submit the UHRP advertisement token data to the overlay
    const responseData = await fetch(serviceURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Topics': 'tm_uhrp', // Topic header for UHRP
      },
      body: JSON.stringify(action),
    });

    if (!responseData.ok) throw new Error('Failed to submit UHRP advertisement');

    // Use type assertion to specify the expected type of the JSON response
    const result = await responseData.json() as UHRPResponse; // Assert the type
    return result.uhrpURL; // Return the UHRP file URL from the response

  } catch (error) {
    console.error('Error creating commitment:', error);
    throw error;
  }
}
