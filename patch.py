import json
with open('/opt/monitor.py', 'r') as f:
    c = f.read()

import re
c = re.sub(r'SYSTEMD_SERVICES = .*', 'SYSTEMD_SERVICES = [\"nginx\", \"parentaile-avatar\", \"parentaile-account\"]', c)

with open('/opt/monitor.py', 'w') as f:
    f.write(c)