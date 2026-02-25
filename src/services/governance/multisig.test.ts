import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MultiSigCoordinationService, ProposalState } from './multisig';

describe('MultiSigCoordinationService', () => {
  let service: MultiSigCoordinationService;

  beforeEach(() => {
    service = new MultiSigCoordinationService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a proposal successfully', () => {
    const callback = vi.fn();
    service.on('proposalCreated', callback);

    service.createProposal('prop1', 2, ['alice', 'bob', 'charlie'], { action: 'transfer' }, 60);

    const proposal = service.getProposal('prop1');
    expect(proposal).toBeDefined();
    expect(proposal?.id).toBe('prop1');
    expect(proposal?.requiredSignatures).toBe(2);
    expect(proposal?.state).toBe(ProposalState.PENDING);
    expect(callback).toHaveBeenCalledWith(proposal);
  });

  it('should throw when creating a proposal with duplicate ID', () => {
    service.createProposal('prop1', 1, ['alice'], {}, 60);
    expect(() => {
      service.createProposal('prop1', 1, ['alice'], {}, 60);
    }).toThrow('Proposal with ID prop1 already exists');
  });

  it('should throw when required signatures exceed signers', () => {
    expect(() => {
      service.createProposal('prop1', 3, ['alice', 'bob'], {}, 60);
    }).toThrow('Required signatures cannot exceed total number of signers');
  });

  it('should return undefined for non-existent proposal', () => {
    expect(service.getProposal('nonexistent')).toBeUndefined();
  });

  it('should collect signatures and transition to APPROVED when threshold met', () => {
    const sigCallback = vi.fn();
    const appCallback = vi.fn();
    service.on('signatureSubmitted', sigCallback);
    service.on('proposalApproved', appCallback);

    service.createProposal('prop1', 2, ['alice', 'bob', 'charlie'], {}, 60);

    // First signature
    const isApproved1 = service.submitSignature('prop1', 'alice', 'sig-alice');
    expect(isApproved1).toBe(false);
    expect(sigCallback).toHaveBeenCalledWith({ id: 'prop1', signer: 'alice', signature: 'sig-alice' });
    expect(appCallback).not.toHaveBeenCalled();
    expect(service.getProposal('prop1')?.state).toBe(ProposalState.PENDING);

    // Second signature (threshold met)
    const isApproved2 = service.submitSignature('prop1', 'bob', 'sig-bob');
    expect(isApproved2).toBe(true);
    expect(sigCallback).toHaveBeenCalledWith({ id: 'prop1', signer: 'bob', signature: 'sig-bob' });
    expect(appCallback).toHaveBeenCalled();
    expect(service.getProposal('prop1')?.state).toBe(ProposalState.APPROVED);
  });

  it('should throw when signing non-existent proposal', () => {
    expect(() => {
      service.submitSignature('prop1', 'alice', 'sig');
    }).toThrow('Proposal prop1 not found');
  });

  it('should throw when unauthorized signer attempts to sign', () => {
    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    expect(() => {
      service.submitSignature('prop1', 'charlie', 'sig');
    }).toThrow('Signer charlie is not authorized for proposal prop1');
  });

  it('should throw when signer signs twice', () => {
    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    service.submitSignature('prop1', 'alice', 'sig1');
    expect(() => {
      service.submitSignature('prop1', 'alice', 'sig2');
    }).toThrow('Signer alice has already signed proposal prop1');
  });

  it('should throw when signing non-PENDING proposal', () => {
    service.createProposal('prop1', 1, ['alice'], {}, 60);
    service.submitSignature('prop1', 'alice', 'sig'); // transitions to APPROVED
    
    // Add charlie manually to signers to test the state check
    const prop = service.getProposal('prop1');
    prop?.signers.add('charlie');

    expect(() => {
      service.submitSignature('prop1', 'charlie', 'sig');
    }).toThrow('Cannot sign proposal in state APPROVED');
  });

  it('should handle timeout correctly on signature submission', () => {
    const callback = vi.fn();
    service.on('proposalRejected', callback);

    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60); // 60 minutes timeout

    // Advance time by 61 minutes
    vi.advanceTimersByTime(61 * 60 * 1000);

    expect(() => {
      service.submitSignature('prop1', 'alice', 'sig');
    }).toThrow('Proposal prop1 has expired');

    const prop = service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.REJECTED);
    expect(callback).toHaveBeenCalledWith({ id: 'prop1', reason: 'Expired', proposal: prop });
  });

  it('should execute an approved proposal', () => {
    const callback = vi.fn();
    service.on('proposalExecuted', callback);

    service.createProposal('prop1', 1, ['alice'], { data: 'test payload' }, 60);
    service.submitSignature('prop1', 'alice', 'sig');

    const payload = service.executeProposal('prop1');
    expect(payload).toEqual({ data: 'test payload' });

    const prop = service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.EXECUTED);
    expect(callback).toHaveBeenCalledWith(prop);
  });

  it('should throw when executing unapproved proposal', () => {
    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    service.submitSignature('prop1', 'alice', 'sig');

    expect(() => {
      service.executeProposal('prop1');
    }).toThrow('Cannot execute proposal in state PENDING');
  });

  it('should throw when executing non-existent proposal', () => {
    expect(() => {
      service.executeProposal('prop1');
    }).toThrow('Proposal prop1 not found');
  });

  it('should record slashing votes', () => {
    const callback = vi.fn();
    service.on('slashingVoteAdded', callback);

    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    service.addSlashingVote('prop1', 'charlie');

    const prop = service.getProposal('prop1');
    expect(prop?.slashingVotes.has('charlie')).toBe(true);
    expect(callback).toHaveBeenCalledWith({ id: 'prop1', voter: 'charlie' });
  });

  it('should throw on duplicate slashing vote', () => {
    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    service.addSlashingVote('prop1', 'charlie');
    expect(() => {
      service.addSlashingVote('prop1', 'charlie');
    }).toThrow('Voter charlie has already submitted a slashing vote');
  });

  it('should throw when adding slashing vote to expired proposal', () => {
    service.createProposal('prop1', 1, ['alice'], {}, 60);
    vi.advanceTimersByTime(61 * 60 * 1000);

    expect(() => {
      service.addSlashingVote('prop1', 'charlie');
    }).toThrow('Proposal prop1 has expired');
  });
  
  it('should reject a proposal explicitly', () => {
    const callback = vi.fn();
    service.on('proposalRejected', callback);

    service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    service.rejectProposal('prop1', 'Malicious payload');

    const prop = service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.REJECTED);
    expect(callback).toHaveBeenCalledWith({ id: 'prop1', reason: 'Malicious payload', proposal: prop });
  });
  
  it('should reject an approved proposal before execution', () => {
    service.createProposal('prop1', 1, ['alice'], {}, 60);
    service.submitSignature('prop1', 'alice', 'sig'); // APPROVED
    service.rejectProposal('prop1', 'Found a bug');
    expect(service.getProposal('prop1')?.state).toBe(ProposalState.REJECTED);
  });

  it('should throw when explicitly rejecting an already executed proposal', () => {
    service.createProposal('prop1', 1, ['alice'], {}, 60);
    service.submitSignature('prop1', 'alice', 'sig');
    service.executeProposal('prop1');

    expect(() => {
      service.rejectProposal('prop1', 'Too late');
    }).toThrow('Cannot reject proposal in state EXECUTED');
  });
});
