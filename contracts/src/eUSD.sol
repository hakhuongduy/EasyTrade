// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Token nội bộ của EasyTrade. Người dùng nhận 10,000 eUSD mỗi 24h qua faucet() để thực hành giao dịch.
contract eUSD is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e18;
    uint256 public constant FAUCET_COOLDOWN = 24 hours;
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(address => uint256) public lastFaucetTime;
    mapping(address => bool) public faucetRelayers;
    mapping(address => uint256) public nonces;

    event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event FaucetRelayerSet(address indexed relayer, bool enabled);

    modifier onlyFaucetRelayer() {
        require(owner() == msg.sender || faucetRelayers[msg.sender], "eUSD: not faucet relayer");
        _;
    }

    constructor(address _initialOwner) ERC20("EasyTrade USD", "eUSD") Ownable(_initialOwner) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("EasyTrade USD")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
        _mint(_initialOwner, 1_000_000 * 1e18);
    }

    function faucet() external {
        _claimFaucet(msg.sender);
    }

    function faucetFor(address _user) external onlyFaucetRelayer {
        _claimFaucet(_user);
    }

    function setFaucetRelayer(address _relayer, bool _enabled) external onlyOwner {
        faucetRelayers[_relayer] = _enabled;
        emit FaucetRelayerSet(_relayer, _enabled);
    }

    function _claimFaucet(address _user) internal {
        require(_user != address(0), "eUSD: invalid user");
        uint256 lastTime = lastFaucetTime[_user];
        if (lastTime != 0) {
            require(
                block.timestamp >= lastTime + FAUCET_COOLDOWN, "eUSD: Faucet cooldown chua ket thuc, vui long cho them"
            );
        }
        lastFaucetTime[_user] = block.timestamp;
        _mint(_user, FAUCET_AMOUNT);
        emit FaucetClaimed(_user, FAUCET_AMOUNT, block.timestamp);
    }

    function faucetCooldownRemaining(address _user) external view returns (uint256) {
        uint256 lastTime = lastFaucetTime[_user];
        if (lastTime == 0) return 0;
        uint256 cooldownEnd = lastTime + FAUCET_COOLDOWN;
        if (block.timestamp >= cooldownEnd) return 0;
        return cooldownEnd - block.timestamp;
    }

    function permit(
        address _owner,
        address _spender,
        uint256 _value,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        require(block.timestamp <= _deadline, "eUSD: permit expired");
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, _owner, _spender, _value, nonces[_owner]++, _deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ecrecover(digest, _v, _r, _s);
        require(recovered != address(0) && recovered == _owner, "eUSD: invalid permit");
        _approve(_owner, _spender, _value);
    }

    function mint(address _to, uint256 _amount) external onlyOwner {
        _mint(_to, _amount);
    }
}
