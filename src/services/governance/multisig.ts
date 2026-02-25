import { EventEmitter } from 'events';

export enum ProposalState {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
}

export interface Proposal {
  id: string;
  requiredSignatures: number;
  signers: Set<string>;
  signatures: Map<string, string>; // signer -> signature
  slashingVotes: Set<string>;
  payload: any;
  state: ProposalState;
  createdAt: number;
  expiresAt: number;
}

export class MultiSigCoordinationService extends EventEmitter {
  private proposals: Map<string, Proposal> = new Map();

  /**
   * Creates a new multi-sig proposal.
   * @param id Unique identifier for the proposal
   * @param requiredSignatures Number of signatures required for approval
   * @param signers Array of eligible signer addresses/IDs
   * @param payload Optional payload to be executed or recorded
   * @param timeoutMinutes Minutes until the proposal expires
   */
  public createProposal(
    id: string,
    requiredSignatures: number,
    signers: string[],
    payload: any,
    timeoutMinutes: number = 60 * 24 // 24 hours default
  ): void {
    if (this.proposals.has(id)) {
      throw new Error(`Proposal with ID ${id} already exists`);
    }

    if (requiredSignatures > signers.length) {
      throw new Error('Required signatures cannot exceed total number of signers');
    }

    const proposal: Proposal = {
      id,
      requiredSignatures,
      signers: new Set(signers),
      signatures: new Map(),
      slashingVotes: new Set(),
      payload,
      state: ProposalState.PENDING,
      createdAt: Date.now(),
      expiresAt: Date.now() + timeoutMinutes * 60 * 1000,
    };

    this.proposals.set(id, proposal);
    this.emit('proposalCreated', proposal);
  }

  /**
   * Retrieves a proposal by ID.
   * @param id Proposal ID
   * @returns The proposal or undefined if not found
   */
  public getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  /**
   * Submits a signature for a proposal.
   * @param id Proposal ID
   * @param signer The address/ID of the signer
   * @param signature The cryptographic signature or approval token
   * @returns true if state transitioned to APPROVED, false otherwise
   */
  public submitSignature(id: string, signer: string, signature: string): boolean {
    const proposal = this.getProposalOrThrow(id);
    
    this.checkExpiration(proposal);

    if (proposal.state !== ProposalState.PENDING) {
      throw new Error(`Cannot sign proposal in state ${proposal.state}`);
    }

    if (!proposal.signers.has(signer)) {
      throw new Error(`Signer ${signer} is not authorized for proposal ${id}`);
    }

    if (proposal.signatures.has(signer)) {
      throw new Error(`Signer ${signer} has already signed proposal ${id}`);
    }

    proposal.signatures.set(signer, signature);
    this.emit('signatureSubmitted', { id, signer, signature });

    if (proposal.signatures.size >= proposal.requiredSignatures) {
      proposal.state = ProposalState.APPROVED;
      this.emit('proposalApproved', proposal);
      return true;
    }

    return false;
  }

  /**
   * Submits a slashing vote against a proposal or specific signers.
   * @param id Proposal ID
   * @param voter The address/ID of the voter
   */
  public addSlashingVote(id: string, voter: string): void {
    const proposal = this.getProposalOrThrow(id);
    
    this.checkExpiration(proposal);

    if (proposal.slashingVotes.has(voter)) {
      throw new Error(`Voter ${voter} has already submitted a slashing vote`);
    }

    proposal.slashingVotes.add(voter);
    this.emit('slashingVoteAdded', { id, voter });
    
    // Custom logic could be added here to reject the proposal if a slashing threshold is met
  }

  /**
   * Executes an approved proposal.
   * @param id Proposal ID
   * @returns The result of the execution or the executed payload
   */
  public executeProposal(id: string): any {
    const proposal = this.getProposalOrThrow(id);

    if (proposal.state !== ProposalState.APPROVED) {
      throw new Error(`Cannot execute proposal in state ${proposal.state}`);
    }

    // Simulate on-chain execution or internal workflow execution
    proposal.state = ProposalState.EXECUTED;
    this.emit('proposalExecuted', proposal);

    return proposal.payload;
  }
  
  /**
   * Rejects a proposal explicitly.
   * @param id Proposal ID
   * @param reason The reason for rejection
   */
  public rejectProposal(id: string, reason: string): void {
    const proposal = this.getProposalOrThrow(id);
    
    if (proposal.state !== ProposalState.PENDING && proposal.state !== ProposalState.APPROVED) {
      throw new Error(`Cannot reject proposal in state ${proposal.state}`);
    }
    
    proposal.state = ProposalState.REJECTED;
    this.emit('proposalRejected', { id, reason, proposal });
  }

  /**
   * Helper to get a proposal or throw if not found.
   */
  private getProposalOrThrow(id: string): Proposal {
    const proposal = this.proposals.get(id);
    if (!proposal) {
      throw new Error(`Proposal ${id} not found`);
    }
    return proposal;
  }

  /**
   * Helper to check if a proposal is expired and update state if so.
   */
  private checkExpiration(proposal: Proposal): void {
    if (proposal.state === ProposalState.PENDING && Date.now() > proposal.expiresAt) {
      proposal.state = ProposalState.REJECTED;
      this.emit('proposalRejected', { id: proposal.id, reason: 'Expired', proposal });
      throw new Error(`Proposal ${proposal.id} has expired`);
    }
  }
}
