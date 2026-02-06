import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const CONTRACT = {
  PACKAGE_ID: '0x4300e4889fe3948458703fb3b230c9529f4a7db04b8241fbda8277d7e21a8914',
  ORDER_REGISTRY: '0xa39f651cc3b3657143b0cb996d10880479ffc11464f882a175a4fe84ebf73bc4',
  VAULT: '0xde76bef37df24183721dffc6f7479b95fc4e302aef0762f0241b38a4805e8ac2',
  CLOCK: '0x6',
};

async function testOrderCreation() {
  const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
  
  // Use a test sender address (the one that created orders)
  const sender = '0x11f9cf2b859dae69c6c2d1af3aa8c6c8b48983af0c57b2b4412e219c461b5f40';
  
  const tx = new Transaction();
  tx.setGasBudget(50000000);
  
  const amountMist = 1_000_000_000n; // 1 SUI
  const scaledPrice = 900_000_000n;  // $0.90
  
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  
  tx.moveCall({
    target: `${CONTRACT.PACKAGE_ID}::entry::create_stop_loss_order`,
    arguments: [
      tx.object(CONTRACT.ORDER_REGISTRY),
      tx.object(CONTRACT.VAULT),
      coin,
      tx.pure.u64(scaledPrice),
      tx.object(CONTRACT.CLOCK),
    ],
  });
  
  tx.setSender(sender);
  
  console.log('Dry-running transaction...');
  try {
    const result = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });
    
    console.log('Status:', result.effects.status.status);
    if (result.effects.status.status !== 'success') {
      console.log('Error:', result.effects.status.error);
    } else {
      console.log('Success! Order creation would work.');
    }
  } catch (err: any) {
    console.error('Dry run failed:', err.message || err);
  }
}

testOrderCreation().catch(console.error);
