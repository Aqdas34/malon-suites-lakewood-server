const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, 
  auth: {
    user: 'maloon@webncodes.site',
    pass: 'WebncodesIs@Safe1234'
  }
});

const mailOptions = {
  from: '"Malon Test System" <maloon@webncodes.site>',
  to: 'manoaqdas33@gmail.com',
  subject: '🚀 Malon Email Server: Test Connection',
  html: `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #9B804E; border-radius: 8px;">
      <h1 style="color: #9B804E;">Connection Successful!</h1>
      <p>This is a test email to confirm that the <strong>Malon Luxury Suites</strong> notification system is correctly configured.</p>
      <hr style="border: 0; border-top: 1px solid #eee;" />
      <p style="font-size: 12px; color: #666;">
        Sender: maloon@webncodes.site<br/>
        Time: ${new Date().toLocaleString()}
      </p>
    </div>
  `
};

console.log('⏳ Attempting to send test email...');

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('❌ ERROR:', error.message);
    if (error.code === 'EAUTH') {
      console.log('👉 Tip: Check your password or if the account needs an App Password.');
    }
  } else {
    console.log('✅ SUCCESS! Email sent successfully.');
    console.log('📄 Message ID:', info.messageId);
    console.log('📥 Please check the inbox of manoaqdas33@gmail.com');
  }
});
