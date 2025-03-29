import bitcoin from "bitcoinjs-lib";
import bs58check from "bs58check";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";

const bip32 = BIP32Factory(ecc);

/**
 * convertZpubToXpub
 *
 * Converts a zpub (BIP84) to an xpub by replacing its version bytes.
 * (zpub version: 0x04b24746; xpub version: 0x0488b21e)
 * @param {string} zpub - The zpub string.
 * @returns {string} The converted xpub string.
 * @throws Will throw an error if the zpub is invalid.
 */
export function convertZpubToXpub(zpub) {
  try {
    const data = Buffer.from(bs58check.decode(zpub));
    // Replace the version bytes with xpub's version bytes.
    data.writeUInt32BE(0x0488b21e, 0);
    return bs58check.encode(data);
  } catch (error) {
    throw new Error("Invalid zpub provided: " + error.message);
  }
}

/**
 * getTxnsForAddress
 *
 * Uses Blockstream’s API to fetch transactions for a given address.
 * @param {string} address - The bitcoin address.
 * @returns {Promise<Array>} A promise that resolves to an array of transactions.
 */
async function getTxnsForAddress(address) {
  try {
    const response = await fetch(`https://blockstream.info/api/address/${address}/txs`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching transactions for address", address, error);
    return [];
  }
}

/**
 * processTransactionForAddress
 *
 * Processes a transaction object for a given scanning address.
 * @param {string} address - The derived address being scanned.
 * @param {object} tx - The transaction object from the API.
 * @returns {Array<object>} Array of processed transaction objects.
 */
function processTransactionForAddress(address, tx) {
  const results = [];
  const txid = tx.txid;
  const timestamp = tx.status && tx.status.block_time ? tx.status.block_time : null;

  // Calculate total received amount
  let totalReceived = 0;
  if (Array.isArray(tx.vout)) {
    tx.vout.forEach((output) => {
      if (output.scriptpubkey_address === address) {
        totalReceived += output.value;
      }
    });
    if (totalReceived > 0) {
      results.push({ address, txid, type: "receive", amount: totalReceived, timestamp });
    }
  }

  // Calculate total sent amount
  let totalSent = 0;
  if (Array.isArray(tx.vin)) {
    tx.vin.forEach((input) => {
      if (input.prevout && input.prevout.scriptpubkey_address === address) {
        totalSent += input.prevout.value;
      }
    });
    if (totalSent > 0) {
      results.push({ address, txid, type: "send", amount: totalSent, timestamp });
    }
  }

  return results;
}

/**
 * deriveAddress
 *
 * Derives the P2WPKH address for a given node and index.
 * @param {object} baseNode - The BIP32 node for the branch.
 * @param {number} index - The child index.
 * @param {object} network - The bitcoin network object.
 * @returns {string} The derived bitcoin address.
 */
function deriveAddress(baseNode, index, network) {
  const child = baseNode.derive(index);
  return bitcoin.payments.p2wpkh({ pubkey: Buffer.from(child.publicKey), network }).address;
}

/**
 * fetchPaymentInfo
 *
 * Scans addresses from a given zpub (external branch by default) and gathers:
 *   - nextAddr: one selected next unused address.
 *   - freshAddr: an array of the next gapLimit addresses.
 *   - txns: all processed transactions (from used addresses), sorted by timestamp.
 *
 * The scan stops after encountering a gap of `gapLimit` consecutive unused addresses.
 *
 * @param {string} zpub - The extended public key (zpub format).
 * @param {number} branch - Derivation branch (0 for external, 1 for change), default 0.
 * @param {number} startIndex - Starting index (default 0).
 * @param {number} gapLimit - Maximum consecutive unused addresses to allow (default 8).
 * @returns {Promise<object>} Object with properties { nextAddr, freshAddr, txns }.
 */
export async function fetchPaymentInfo(zpub, branch = 0, startIndex = 0, gapLimit = 8) {
  // Convert zpub to xpub and initialize the BIP32 node
  const xpub = convertZpubToXpub(zpub);
  const network = bitcoin.networks.bitcoin;
  const node = bip32.fromBase58(xpub, network);
  
  // Cache the branch node to avoid repeated derivation.
  const branchNode = node.derive(branch);
  
  let unusedCount = 0;
  let currentIndex = startIndex;
  let allTxns = [];
  let lastUsedIndex = startIndex - 1;

  // Sequentially scan addresses until gapLimit consecutive unused addresses are found.
  while (unusedCount < gapLimit) {
    const address = deriveAddress(branchNode, currentIndex, network);
    const txns = await getTxnsForAddress(address);

    if (txns.length === 0) {
      unusedCount++;
    } else {
      unusedCount = 0; // Reset counter when a used address is found.
      lastUsedIndex = currentIndex;
      txns.forEach((tx) => {
        const processed = processTransactionForAddress(address, tx);
        allTxns.push(...processed);
      });
    }
    currentIndex++;
  }

  // Generate the next gapLimit addresses after the last used index.
  const nextAddresses = [];
  for (let i = 1; i <= gapLimit; i++) {
    nextAddresses.push(deriveAddress(branchNode, lastUsedIndex + i, network));
  }

  // Sort transactions by timestamp (null timestamps are pushed to the end)
  allTxns.sort((a, b) => {
    if (a.timestamp === null && b.timestamp === null) return 0;
    if (a.timestamp === null) return 1;
    if (b.timestamp === null) return -1;
    return a.timestamp - b.timestamp;
  });

  return {
    // Optionally, you can choose the first unused address instead of a random one.
    nextAddr: nextAddresses[Math.floor(Math.random() * nextAddresses.length)],
    freshAddr: nextAddresses,
    txns: allTxns,
  };
}

/**
 * checkAddressUsage
 *
 * Checks whether a given bitcoin address has been used, and calculates its balance.
 * It returns an object containing:
 *   - used: Boolean indicating if the address has any transactions.
 *   - balance: Computed balance (total received minus total sent).
 *   - transactions: Count of transactions returned from the API.
 *   - txns: An array of processed transaction details.
 *
 * @param {string} address - The bitcoin address to check.
 * @returns {Promise<object>} An object with properties { used, balance, transactions, txns }.
 */
export async function checkAddressUsage(address) {
  const txns = await getTxnsForAddress(address);
  const processedTxns = [];
  let balance = 0;

  // Process each transaction and compute the balance
  txns.forEach((tx) => {
    const processed = processTransactionForAddress(address, tx);
    processed.forEach((entry) => {
      // For received transactions, add the amount; for sent, subtract the amount.
      if (entry.type === "receive") {
        balance += entry.amount;
      } else if (entry.type === "send") {
        balance -= entry.amount;
      }
    });
    processedTxns.push(...processed);
  });

  return {
    used: txns.length > 0,
    balance,
    transactions: txns.length,
    txns: processedTxns,
  };
}
