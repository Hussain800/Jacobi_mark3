import sys
import os

try:
    import web3
    import solcx
except ImportError:
    import subprocess
    print("Installing web3 and py-solc-x packages...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "web3", "py-solc-x"])
    import web3
    import solcx

from web3 import Web3
import solcx

# Ensure solc 0.8.24 is installed locally
try:
    installed = [str(v) for v in solcx.get_installed_solc_versions()]
except Exception:
    installed = []

if "0.8.24" not in installed:
    print("Downloading and installing Solidity compiler version 0.8.24...")
    solcx.install_solc("0.8.24")

solcx.set_solc_version("0.8.24")

# Compile contract files
print("Compiling JacobiPricingLedger.sol...")
contract_path = "c:/Users/wasif/OneDrive/Desktop/aegisagent/Jacobi/contracts/JacobiPricingLedger.sol"
compiled_sol = solcx.compile_files([contract_path], output_values=["abi", "bin"])
contract_id = next((k for k in compiled_sol.keys() if k.endswith(":JacobiPricingLedger")), None)
if not contract_id:
    raise KeyError("Could not find JacobiPricingLedger in compiled contracts keys: " + str(list(compiled_sol.keys())))
contract_interface = compiled_sol[contract_id]

abi = contract_interface['abi']
bytecode = contract_interface['bin']

# Connect to Sepolia testnet
rpc_url = "https://eth-sepolia.g.alchemy.com/v2/BlIEksFG2E18y9oZOYD6I"
private_key = "0e7a242af3b7a0ea9b914907ca47d6afec944bc06adc259487b8a2dcc123c70e"

print("Connecting to Sepolia via Alchemy provider...")
w3 = Web3(Web3.HTTPProvider(rpc_url))
if not w3.is_connected():
    print("Error: Connection to Sepolia testnet failed.")
    sys.exit(1)

account = w3.eth.account.from_key(private_key)
print(f"Deployer Address: {account.address}")
balance = w3.eth.get_balance(account.address)
balance_eth = w3.from_wei(balance, 'ether')
print(f"Deployer Balance: {balance_eth} ETH")

if balance == 0:
    print("Error: Account balance is 0 ETH. Please add Sepolia ETH first.")
    sys.exit(1)

print("Constructing transaction payload...")
JacobiContract = w3.eth.contract(abi=abi, bytecode=bytecode)

# Fetch current EIP-1559 base fee and configure maximum parameters
fee_history = w3.eth.fee_history(1, 'latest', [25.0])
base_fee = fee_history['baseFeePerGas'][-1]
max_priority_fee = 2000000000  # 2 Gwei priority fee
max_fee = int(base_fee * 2) + max_priority_fee

# Build tx
tx = JacobiContract.constructor().build_transaction({
    'from': account.address,
    'nonce': w3.eth.get_transaction_count(account.address),
    'gas': 3000000,
    'maxFeePerGas': max_fee,
    'maxPriorityFeePerGas': max_priority_fee,
    'chainId': 11155111  # Sepolia testnet ID
})

# Sign tx
print("Signing transaction...")
signed_tx = w3.eth.account.sign_transaction(tx, private_key=private_key)

# Broadcast
print("Broadcasting transaction hash to Sepolia...")
tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
tx_hex = w3.to_hex(tx_hash)
print(f"Transaction Broadcasted. Hash: {tx_hex}")

# Wait for confirmation receipt
print("Waiting for transaction confirmation (this may take up to 30 seconds)...")
tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
contract_address = tx_receipt.contractAddress
print(f"Contract successfully initialized and deployed at: {contract_address}")

# Save deployment data
output_info = {
    "address": contract_address,
    "abi": abi
}
import json
output_path = "c:/Users/wasif/OneDrive/Desktop/aegisagent/Jacobi/contracts/deployed_sepolia.json"
with open(output_path, "w") as f:
    json.dump(output_info, f, indent=2)
print(f"Deployment info (address & ABI) written to: {output_path}")
