import base64, tempfile, unittest
from pathlib import Path
from werkzeug.security import generate_password_hash
import app as backend

class PlacementApiTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();backend.DB=Path(self.temp.name)/'test.db';backend.init_db();backend.app.config['TESTING']=True
        self.officer=backend.app.test_client();self.student=backend.app.test_client();self.company=backend.app.test_client();self.csrf={}
        with backend.app.app_context():
            backend.db().execute("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'officer')",('Officer','officer@test.com',generate_password_hash('Test-password-123',method='scrypt')));backend.db().commit()
        self.login(self.officer,'officer@test.com')
    def tearDown(self):self.temp.cleanup()
    def call(self,client,path,method='get',json=None,csrf=True):
        response=getattr(client,method)(path,json=json,headers={'X-CSRF-Token':self.csrf.get(id(client),'')} if csrf else {});value=response.get_json(silent=True)
        if isinstance(value,dict) and value.get('csrf'):self.csrf[id(client)]=value['csrf']
        return response
    def login(self,client,email,password='Test-password-123'):return self.call(client,'/api/auth/login','post',{'email':email,'password':password})
    def register(self,client,email,role='student'):return self.call(client,'/api/auth/register','post',{'name':'Test User','email':email,'password':'Test-password-123','role':role,'company_name':'Test Labs','industry':'Tech','location':'Chennai'})
    def test_complete_workflow_and_access_control(self):
        self.assertEqual(self.call(backend.app.test_client(),'/api/jobs').status_code,401);self.register(self.student,'student@test.com');company=self.register(self.company,'company@test.com','company').get_json()['user']
        opening={'title':'Engineer','description':'Build software','min_cgpa':7,'required_skills':'Python, SQL','deadline':'2099-12-31'}
        self.assertEqual(self.call(self.company,'/api/jobs','post',opening).status_code,403);self.call(self.officer,f"/api/companies/{company['company_id']}",'patch',{'approved':True});job_id=self.call(self.company,'/api/jobs','post',opening).get_json()['id']
        self.call(self.student,'/api/profile','patch',{'name':'Student','cgpa':8.5,'skills':'Python','education':'B.Tech','graduation_year':'2027'});self.call(self.student,'/api/resume','post',{'name':'resume.pdf','data':base64.b64encode(b'%PDF-1.4\ntest').decode()});self.call(self.student,f'/api/saved/{job_id}','put',{})
        application=self.call(self.student,'/api/applications','post',{'job_id':job_id});self.assertEqual(application.status_code,201);app_id=application.get_json()['id'];self.assertEqual(self.call(self.student,'/api/applications','post',{'job_id':job_id}).status_code,409);self.assertEqual(self.call(self.student,f'/api/applications/{app_id}','patch',{'status':'Selected'}).status_code,403)
        self.assertEqual(self.call(self.company,f'/api/applications/{app_id}','patch',{'status':'Shortlisted'}).status_code,200);self.assertEqual(self.call(self.company,f'/api/applications/{app_id}','patch',{'status':'Interview scheduled','interview_at':'2099-10-01T10:00:00Z','interview_location':'Room 1'}).status_code,200);self.assertEqual(self.call(self.student,'/api/applications').get_json()[0]['status'],'Interview scheduled')
        outsider=backend.app.test_client();self.register(outsider,'outsider@test.com','company');self.assertEqual(self.call(outsider,f'/api/applications/{app_id}','patch',{'status':'Rejected'}).status_code,403);self.assertEqual(self.call(outsider,'/api/resumes/2').status_code,403)
    def test_csrf_password_logout_and_health(self):
        self.register(self.student,'student@test.com');self.assertEqual(self.call(self.student,'/api/profile','patch',{},csrf=False).status_code,403);self.assertEqual(self.call(self.student,'/api/auth/password','post',{'current_password':'Test-password-123','new_password':'Changed-password-456'}).status_code,200);self.assertEqual(self.call(self.student,'/api/auth/logout','post',{}).status_code,200);self.assertEqual(self.call(self.student,'/api/auth/me').status_code,401);self.assertEqual(self.login(self.student,'student@test.com','Changed-password-456').status_code,200);self.assertEqual(self.call(self.student,'/api/health').get_json()['backend'],'flask')
if __name__=='__main__':unittest.main()
