import nodemailer from 'nodemailer';

export function createMailer(env) {
  return env.SMTP_HOST && env.MAIL_FROM && nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_PORT === '465',
    requireTLS: env.SMTP_HOST !== '127.0.0.1' && env.SMTP_PORT !== '465',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, socketTimeout: 20000
  });
}
