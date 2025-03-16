#
#cd .\Users\ngong\Downloads\v
#Start-Process python -ArgumentList "myserver.py 31409" -NoNewWindow
#taskkill /IM python.exe /F
#http://113.161.47.217:31409/vj.html 
#
from http.server import HTTPServer, SimpleHTTPRequestHandler

class CustomHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Welcome to Secured HTTP Server!</h1>")
        else:
            super().do_GET()  # Serve static files normally

server_address = ("", 31409)  # Host on all available IPs, port 31409
httpd = HTTPServer(server_address, CustomHandler)

print("Serving on port 31409...")
httpd.serve_forever()
