interface Props {
  category: string;
  score?: number;
}

export default function ConfidenceBadge({ category, score }: Props) {
  return (
    <span className={`badge ${category}`}>
      {category}
      {score !== undefined && ` ${(score * 100).toFixed(1)}%`}
    </span>
  );
}
