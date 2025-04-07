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
    const response = await fetch(
      `https://blockstream.info/api/address/${address}/txs`
    );
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
  return bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network,
  }).address;
}

/**
 * fetchPaymentInfo
 *
 * Scans addresses from a given zpub (external branch by default) to determine the next unused address:
 *   - nextAddr: one selected next unused address based on offset.
 *
 * The scan stops after encountering a gap of `gapLimit` consecutive unused addresses.
 *
 * @param {string} zpub - The extended public key (zpub format).
 * @param {number} branch - Derivation branch (0 for external, 1 for change), default 0.
 * @param {number} offset - Offset from the last used address to select next address (default 1).
 * @param {number} gapLimit - Maximum consecutive unused addresses to allow (default 20).
 * @returns {Promise<object>} Object with property { nextAddr }.
 */
export async function nextAddress(zpub, offset = 0) {
  // Convert zpub to xpub and initialize the BIP32 node
  const xpub = convertZpubToXpub(zpub);
  const network = bitcoin.networks.bitcoin;
  const node = bip32.fromBase58(xpub, network);

  // Cache the branch node to avoid repeated derivation.
  const branchNode = node.derive(0);

  let currentIndex = 0;
  let nextAddrx = null;
  let offsetCount = offset;

  while (nextAddrx === null) {
    const address = deriveAddress(branchNode, currentIndex, network);
    const txns = await getTxnsForAddress(address);
    if (txns.length === 0) {
      if (offsetCount > 0) {
        offsetCount--;
      } else {
        nextAddrx = address;
      }
    }

    currentIndex++;
  }

  return {
    index: currentIndex,
    address: nextAddrx,
  };
}
