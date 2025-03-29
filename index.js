import bitcoin from "bitcoinjs-lib";
import bs58check from "bs58check";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";

// Create a BIP32 instance using tiny-secp256k1
const bip32 = BIP32Factory(ecc);

/**
 * convertZpubToXpub
 *
 * Converts a zpub (BIP84) to an xpub by replacing its version bytes.
 * (zpub version: 0x04b24746; xpub version: 0x0488b21e)
 */
export function convertZpubToXpub(zpub) {
  const data = Buffer.from(bs58check.decode(zpub));
  data.writeUInt32BE(0x0488b21e, 0); // Replace with xpub version bytes
  return bs58check.encode(data);
}

/**
 * getTxnsForAddress
 *
 * Uses Blockstream’s API to fetch transactions for a given address.
 */
async function getTxnsForAddress(address) {
  try {
    const response = await fetch(`https://blockstream.info/api/address/${address}/txs`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const txns = await response.json();
    return txns;
  } catch (error) {
    console.error("Error fetching transactions for address", address, error);
    return [];
  }
}

/**
 * processTransactionForAddress
 *
 * Processes a transaction object (from Blockstream API) for a given scanning address.
 * Returns an array of objects with structure:
 *   { address, txid, type, amount, timestamp }
 *
 * The timestamp is taken from tx.status.block_time if available.
 *
 * @param {string} address - The derived address being scanned.
 * @param {object} tx - The transaction object from the API.
 * @returns {Array<object>}
 */
function processTransactionForAddress(address, tx) {
  const results = [];
  const txid = tx.txid;
  // Use block_time if available; otherwise, null.
  const timestamp = tx.status && tx.status.block_time ? tx.status.block_time : null;

  // Calculate total received amount: check each vout with matching address.
  let totalReceived = 0;
  if (Array.isArray(tx.vout)) {
    tx.vout.forEach(output => {
      if (output.scriptpubkey_address === address) {
        totalReceived += output.value;
      }
    });
    if (totalReceived > 0) {
      results.push({
        address,
        txid,
        type: "receive",
        amount: totalReceived,
        timestamp,
      });
    }
  }

  // Calculate total sent amount: check each vin where the previous output is from our address.
  let totalSent = 0;
  if (Array.isArray(tx.vin)) {
    tx.vin.forEach(input => {
      if (input.prevout && input.prevout.scriptpubkey_address === address) {
        totalSent += input.prevout.value;
      }
    });
    if (totalSent > 0) {
      results.push({
        address,
        txid,
        type: "send",
        amount: totalSent,
        timestamp,
      });
    }
  }

  return results;
}

/**
 * fetchPaymentInfo
 *
 * Scans addresses from a given zpub (external branch by default) and gathers:
 *   - nextAddress: the first unused address (after the last used one)
 *   - txns: all processed transactions (from used addresses), sorted by timestamp.
 *
 * The scan stops after encountering a gap of `gapLimit` consecutive unused addresses.
 *
 * @param {string} zpub - The extended public key (zpub format).
 * @param {number} branch - Derivation branch (0 for external, 1 for change), default 0.
 * @param {number} startIndex - Starting index (default 0).
 * @param {number} gapLimit - Maximum consecutive unused addresses to allow (default 5).
 * @returns {Promise<object>} - Object of the form { nextAddress: string, txns: [] }
 */
export async function fetchPaymentInfo(zpub, branch = 0, startIndex = 0, gapLimit = 5) {
  const xpub = convertZpubToXpub(zpub);
  const network = bitcoin.networks.bitcoin;
  const node = bip32.fromBase58(xpub, network);

  let unusedCount = 0;
  let currentIndex = startIndex;
  let allTxns = [];
  let nextAddress = null;

  while (unusedCount < gapLimit) {
    // Derive address at m/branch/currentIndex
    const child = node.derive(branch).derive(currentIndex);
    const address = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(child.publicKey),
      network: network,
    }).address;

    console.log(`Scanning index ${currentIndex}: ${address}`);

    // Fetch transactions for the address
    const txns = await getTxnsForAddress(address);

    if (txns.length === 0) {
      unusedCount++;
      if (nextAddress === null) {
        nextAddress = address;
      }
    } else {
      unusedCount = 0; // Reset gap counter when a used address is found.
      txns.forEach(tx => {
        const processed = processTransactionForAddress(address, tx);
        allTxns.push(...processed);
      });
    }

    currentIndex++;
  }

  // Sort transactions by timestamp in ascending order (transactions without timestamp will be placed last)
  allTxns.sort((a, b) => {
    if (a.timestamp === null && b.timestamp === null) return 0;
    if (a.timestamp === null) return 1;
    if (b.timestamp === null) return -1;
    return a.timestamp - b.timestamp;
  });

  return { nextAddress, txns: allTxns };
}
