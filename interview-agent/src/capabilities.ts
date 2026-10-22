// What this build of the agent can run. An interview that asks for more is
// refused at create (422) rather than accepted and quietly degraded.
//
// Coding questions need the isolated sandbox (milestone I4, D32): until a
// generated task's reference solution can be run against its own tests,
// none may be shown to a candidate.
export const CODING_AVAILABLE = false;

// Voice needs speech synthesis and transcription models, chosen and recorded
// at milestone I5.
export const VOICE_AVAILABLE = false;
