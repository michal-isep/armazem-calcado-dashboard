export function ApiProblem({ what, error }: { what: string; error: string }) {
  return (
    <p role="alert" className="error">
      {what} unavailable. {error}
    </p>
  );
}
