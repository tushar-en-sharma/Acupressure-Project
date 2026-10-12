#!/usr/bin/env bash
# One-time AWS setup for the GitHub Actions deploy (.github/workflows/deploy.yml).
# Run from the repo root with AWS credentials configured:
#
#   ./deploy/aws-setup.sh
#
# Safe to re-run — every step checks for the existing resource first. It:
#   1. gives the EC2 instance a fixed Elastic IP (the subdomain's A record
#      points here, so it must not change when the instance restarts)
#   2. opens ports 80/443 in the instance's security group
#   3. makes sure the instance's role can pull from ECR and be driven by SSM
#   4. keeps only the 10 newest images in ECR
#   5. lets GitHub Actions (this repo's main branch / production
#      environment only) assume a narrowly-scoped deploy role via OIDC —
#      no long-lived AWS keys stored in GitHub
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
INSTANCE_ID="${INSTANCE_ID:-i-0863178360ec9127e}"
GITHUB_REPO="${GITHUB_REPO:-tushar-en-sharma/Acupressure-Project}"
ECR_REPO="${ECR_REPO:-acupressure-backend}"
DEPLOY_ROLE="${DEPLOY_ROLE:-acupressure-github-deploy}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "== Elastic IP =="
EIP="$(aws ec2 describe-addresses --filters "Name=instance-id,Values=$INSTANCE_ID" --query 'Addresses[0].PublicIp' --output text)"
if [ "$EIP" = None ] || [ -z "$EIP" ]; then
  ALLOC_ID="$(aws ec2 allocate-address --domain vpc \
    --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=acupressure}]' \
    --query AllocationId --output text)"
  aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
  EIP="$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text)"
fi
echo "  $EIP"

echo "== Security group: 80/tcp, 443/tcp, 443/udp =="
SG_ID="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)"
for rule in tcp:80 tcp:443 udp:443; do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol "${rule%%:*}" --port "${rule##*:}" --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
done
echo "  $SG_ID"

echo "== Instance role permissions =="
PROFILE_ARN="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text)"
INSTANCE_ROLE="$(aws iam get-instance-profile --instance-profile-name "${PROFILE_ARN##*/}" \
  --query 'InstanceProfile.Roles[0].RoleName' --output text)"
for policy in AmazonSSMManagedInstanceCore AmazonEC2ContainerRegistryReadOnly; do
  aws iam attach-role-policy --role-name "$INSTANCE_ROLE" --policy-arn "arn:aws:iam::aws:policy/$policy"
done
echo "  $INSTANCE_ROLE"

echo "== ECR repository + lifecycle =="
aws ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$ECR_REPO" >/dev/null
aws ecr put-lifecycle-policy --repository-name "$ECR_REPO" --lifecycle-policy-text '{
  "rules": [{"rulePriority": 1, "description": "keep 10 newest",
             "selection": {"tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10},
             "action": {"type": "expire"}}]
}' >/dev/null
echo "  $ECR_REPO"

echo "== GitHub OIDC provider =="
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1 \
  || aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
       --client-id-list sts.amazonaws.com >/dev/null
echo "  $OIDC_ARN"

echo "== Deploy role: $DEPLOY_ROLE =="
TRUST="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "$OIDC_ARN"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
      "StringLike": {"token.actions.githubusercontent.com:sub": [
        "repo:${GITHUB_REPO}:environment:production",
        "repo:${GITHUB_REPO}:ref:refs/heads/main"
      ]}
    }
  }]
}
EOF
)"
if aws iam get-role --role-name "$DEPLOY_ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$DEPLOY_ROLE" --policy-document "$TRUST"
else
  aws iam create-role --role-name "$DEPLOY_ROLE" --assume-role-policy-document "$TRUST" \
    --description "GitHub Actions deploy for ${GITHUB_REPO}" >/dev/null
fi
aws iam put-role-policy --role-name "$DEPLOY_ROLE" --policy-name deploy --policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"},
    {"Effect": "Allow",
     "Action": ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"],
     "Resource": "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}"},
    {"Effect": "Allow", "Action": "ssm:SendCommand",
     "Resource": ["arn:aws:ec2:${AWS_REGION}:${ACCOUNT_ID}:instance/${INSTANCE_ID}",
                  "arn:aws:ssm:${AWS_REGION}::document/AWS-RunShellScript"]},
    {"Effect": "Allow", "Action": "ssm:GetCommandInvocation", "Resource": "*"}
  ]
}
EOF
)"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${DEPLOY_ROLE}"
echo "  $ROLE_ARN"

echo
echo "Done. Deploy role: $ROLE_ARN (referenced in .github/workflows/deploy.yml)"
echo "Point your subdomain at the instance with a DNS record:"
echo "    Type A   Value $EIP   (TTL 300, proxy OFF if using Cloudflare)"
echo "then set APP_DOMAIN in .github/workflows/deploy.yml and push to main."
