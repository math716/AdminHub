import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendAdminApprovalEmail({
  userName,
  userEmail,
  userRole,
  gabineteNome,
  approveUrl,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
  gabineteNome: string;
  approveUrl: string;
}) {
  const to = process.env.ADMIN_EMAIL;
  if (!to || !process.env.SMTP_HOST) return; // silently skip if not configured

  const roleLabel: Record<string, string> = {
    CHEFE: 'Chefe de Gabinete',
    ASSESSOR: 'Assessor',
    ADMIN: 'Administrador',
  };

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: `[AdminHub] Novo cadastro aguardando aprovação — ${userName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;background:#071d36;border-radius:12px;overflow:hidden;border:1px solid rgba(37,99,235,0.3)">
        <div style="background:linear-gradient(135deg,#071d36,#0c2a4f);padding:28px 32px;border-bottom:1px solid rgba(37,99,235,0.2)">
          <h2 style="margin:0;color:#2563EB;font-size:20px">AdminHub — Novo Cadastro</h2>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.5);font-size:13px">Aguardando sua aprovação</p>
        </div>
        <div style="padding:28px 32px;color:#fff">
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7);font-size:14px">
            Um novo usuário se cadastrou e está aguardando aprovação:
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:rgba(255,255,255,0.45);width:120px">Nome</td><td style="padding:8px 0;color:#fff;font-weight:600">${userName}</td></tr>
            <tr><td style="padding:8px 0;color:rgba(255,255,255,0.45)">E-mail</td><td style="padding:8px 0;color:#4a9ede">${userEmail}</td></tr>
            <tr><td style="padding:8px 0;color:rgba(255,255,255,0.45)">Perfil</td><td style="padding:8px 0;color:#2563EB">${roleLabel[userRole] ?? userRole}</td></tr>
            <tr><td style="padding:8px 0;color:rgba(255,255,255,0.45)">Gabinete</td><td style="padding:8px 0;color:#fff">${gabineteNome}</td></tr>
          </table>
          <div style="margin-top:28px">
            <a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#3B82F6);color:#04111f;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px">
              Acessar gerenciamento de usuários
            </a>
          </div>
          <p style="margin-top:20px;color:rgba(255,255,255,0.3);font-size:12px">
            Este e-mail foi enviado automaticamente pelo sistema AdminHub.
          </p>
        </div>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail({
  userName,
  userEmail,
  tempPassword,
  loginUrl,
}: {
  userName: string;
  userEmail: string;
  tempPassword: string;
  loginUrl: string;
}) {
  if (!process.env.SMTP_HOST) return false;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: userEmail,
      subject: '[AdminHub] Sua senha foi redefinida',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;background:#071d36;border-radius:12px;overflow:hidden;border:1px solid rgba(37,99,235,0.3)">
          <div style="background:linear-gradient(135deg,#071d36,#0c2a4f);padding:28px 32px;border-bottom:1px solid rgba(37,99,235,0.2)">
            <h2 style="margin:0;color:#2563EB;font-size:20px">AdminHub — Redefinição de Senha</h2>
          </div>
          <div style="padding:28px 32px;color:#fff">
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:14px">
              Olá, <strong style="color:#fff">${userName}</strong>!
            </p>
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:14px">
              Sua senha foi redefinida por um administrador. Use a senha temporária abaixo para acessar o sistema e altere-a imediatamente:
            </p>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(74,158,222,0.3);border-radius:8px;padding:16px;text-align:center;margin:20px 0">
              <span style="font-size:22px;font-weight:700;color:#4a9ede;letter-spacing:2px;font-family:monospace">${tempPassword}</span>
            </div>
            <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#3B82F6);color:#04111f;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px">
              Acessar o AdminHub
            </a>
            <p style="margin-top:20px;color:rgba(255,255,255,0.3);font-size:12px">
              Se você não solicitou a redefinição de senha, entre em contato com o administrador imediatamente.
            </p>
          </div>
        </div>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendUserApprovedEmail({
  userName,
  userEmail,
  loginUrl,
}: {
  userName: string;
  userEmail: string;
  loginUrl: string;
}) {
  if (!process.env.SMTP_HOST) return;

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: userEmail,
    subject: `[AdminHub] Cadastro aprovado — Bem-vindo(a), ${userName}!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;background:#071d36;border-radius:12px;overflow:hidden;border:1px solid rgba(37,99,235,0.3)">
        <div style="background:linear-gradient(135deg,#071d36,#0c2a4f);padding:28px 32px;border-bottom:1px solid rgba(37,99,235,0.2)">
          <h2 style="margin:0;color:#2563EB;font-size:20px">AdminHub — Cadastro Aprovado</h2>
        </div>
        <div style="padding:28px 32px;color:#fff">
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:14px">
            Olá, <strong style="color:#fff">${userName}</strong>!
          </p>
          <p style="margin:0 0 24px;color:rgba(255,255,255,0.7);font-size:14px">
            Seu cadastro foi aprovado. Você já pode acessar o sistema.
          </p>
          <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#3B82F6);color:#04111f;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px">
            Acessar o AdminHub
          </a>
        </div>
      </div>
    `,
  });
}
